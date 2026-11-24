begin;
-- Контакти господаря: захист від масового збору (ревю безпеки 2026-11-24, знахідка 1).
-- До цього pilot_spot_host_card віддавала телефон і email кожному увійшлому, незалежно від обраних
-- господарем каналів, а реєстрація миттєва — бот збирав контакти всіх господарів перебором точок.
--
-- 1) Картка більше не віддає телефон і email кожному: лише господарю (те, чим він ділиться з гостями)
--    і гостю з підтвердженим або завершеним бронюванням у цього господаря.
-- 2) Решта увійшлих відкривають контакти кнопкою — reveal_host_contacts(point_id): лише те, що господар
--    обрав у каналах (телефон — «Дзвінок», Telegram, Viber, WhatsApp; email — «Email»),
--    не більше 20 різних господарів на добу (за київським часом).
-- 3) Анонімам — ім'я й перша літера прізвища, а не повне ім'я.
--
-- Порядок розгортання: спершу ця міграція, потім сайт. Старий сайт просто не покаже контактів
-- (колонки phone/email у картці лишаються, тож він не зламається).
-- Ліміт 20 має збігатися з CONTACT_REVEALS_PER_DAY у js/host-profile.js.

-- ---- Хто кому відкривав контакти сьогодні (для ліміту) ----
create table public.host_contact_reveals (
 viewer_id uuid not null references auth.users(id) on delete cascade,
 host_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 primary key (viewer_id, day, host_id)
);
alter table public.host_contact_reveals enable row level security;
revoke all on public.host_contact_reveals from anon, authenticated;

-- ---- Що господар дозволив показувати (за profiles.contact_channels) ----
create function public.host_shares_phone(channels text[]) returns boolean
language sql immutable set search_path = '' as $$
 select coalesce(channels && array['phone', 'telegram', 'viber', 'whatsapp']::text[], false);
$$;
create function public.host_shares_email(channels text[]) returns boolean
language sql immutable set search_path = '' as $$
 select coalesce('email' = any(channels), false);
$$;
revoke all on function public.host_shares_phone(text[]) from public, anon, authenticated;
revoke all on function public.host_shares_email(text[]) from public, anon, authenticated;

-- Поточний користувач — гість з підтвердженим або завершеним бронюванням у цього господаря.
create function public.has_booking_with_host(host uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.pilot_bookings b join public.pilot_spots s on s.id = b.spot_id
  where s.owner_id = host and b.guest_id = auth.uid() and b.status in ('confirmed', 'completed'));
$$;
revoke all on function public.has_booking_with_host(uuid) from public, anon, authenticated;

-- ---- Картка господаря ----
drop function public.pilot_spot_host_card(uuid);
create function public.pilot_spot_host_card(point_id uuid)
returns table (host_name text, registered_at timestamptz, host_verified boolean, phone text, email text,
 completed_sessions integer, recent_hours numeric[], avatar_path text, contact_channels text[], has_contacts boolean)
language sql stable security definer set search_path = '' as $$
 with spot as (
  select s.id, s.owner_id from public.pilot_spots s
  where s.id = point_id
   and (s.owner_id = auth.uid()
    or (s.archived_at is null and s.hidden_at is null and not s.owner_blocked
     and (not s.paused or public.has_active_pilot_booking(s.id))))
 ), done as (
  select upper(b.slot) as ended, extract(epoch from upper(b.slot) - lower(b.slot)) / 3600 as hours
  from public.pilot_bookings b where b.spot_id = point_id and b.status = 'completed'
 ), viewer as (
  select auth.uid() is not null and public.account_is_active() as active,
   exists (select 1 from spot where owner_id = auth.uid()) as own
 )
 select
  case when v.active
   then coalesce(nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), nullif(btrim(p.name), ''), 'Господар точки')
   -- Аноніму: «Олег К.» — без повного прізвища.
   else coalesce(nullif(btrim(coalesce(u.first_name, '') || coalesce(' ' || nullif(left(btrim(u.last_name), 1), '') || '.', '')), ''),
    nullif(btrim(p.name), ''), 'Господар точки')
  end,
  u.registered_at, u.verified_at is not null,
  case when v.active and u.status = 'active' and (
    (v.own and public.host_shares_phone(p.contact_channels)) or public.has_booking_with_host(s.owner_id)) then p.phone end,
  case when v.active and u.status = 'active' and (
    (v.own and public.host_shares_email(p.contact_channels)) or public.has_booking_with_host(s.owner_id)) then u.email end,
  (select count(*)::integer from done),
  coalesce((select array_agg(round(d.hours::numeric, 1) order by d.ended desc)
   from (select * from done order by ended desc limit 5) d), '{}'),
  p.avatar_path,
  coalesce(p.contact_channels, '{}'),
  -- Чи є що відкривати кнопкою «Показати контакти» (саму кнопку бачать лише увійшлі).
  u.status = 'active' and ((public.host_shares_phone(p.contact_channels) and p.phone is not null)
   or public.host_shares_email(p.contact_channels))
 from spot s
 join public.users u on u.id = s.owner_id
 left join public.profiles p on p.id = s.owner_id
 cross join viewer v;
$$;
revoke all on function public.pilot_spot_host_card(uuid) from public;
grant execute on function public.pilot_spot_host_card(uuid) to anon, authenticated;

-- ---- Контакти на запит ----
-- limited = true — денний ліміт вичерпано (контакти не віддаються). Повторне відкриття того самого
-- господаря того ж дня ліміт не витрачає. Господар про себе й гість з бронюванням ліміту не мають.
create function public.reveal_host_contacts(point_id uuid)
returns table (phone text, email text, limited boolean)
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); host uuid; host_phone text; host_email text; channels text[];
 today date := (now() at time zone 'Europe/Kyiv')::date;
begin
 if me is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 -- Видимість точки — як у політиці читання pilot_spots; заблокованого господаря не показуємо.
 select s.owner_id, pr.phone, u.email, coalesce(pr.contact_channels, '{}')
 into host, host_phone, host_email, channels
 from public.pilot_spots s
 join public.users u on u.id = s.owner_id and u.status = 'active'
 left join public.profiles pr on pr.id = s.owner_id
 where s.id = point_id
  and (s.owner_id = me or (s.archived_at is null and s.hidden_at is null and not s.owner_blocked
   and (not s.paused or public.has_active_pilot_booking(s.id))));
 if host is null then raise exception 'bad_target' using errcode = '22023'; end if;

 -- Гість з бронюванням уже бачить контакти в картці: без фільтра каналів і без ліміту.
 if public.has_booking_with_host(host) then
  return query select host_phone, host_email, false;
  return;
 end if;

 if not public.host_shares_phone(channels) then host_phone := null; end if;
 if not public.host_shares_email(channels) then host_email := null; end if;
 if host = me or (host_phone is null and host_email is null) then
  return query select host_phone, host_email, false;
  return;
 end if;

 -- Серіалізуємо запити одного користувача, інакше паралельні виклики обійшли б ліміт.
 perform pg_advisory_xact_lock(hashtext('host_contact_reveals:' || me::text));
 delete from public.host_contact_reveals r where r.viewer_id = me and r.day < today;
 if not exists (select 1 from public.host_contact_reveals r where r.viewer_id = me and r.day = today and r.host_id = host)
    and (select count(*) from public.host_contact_reveals r where r.viewer_id = me and r.day = today) >= 20 then
  return query select null::text, null::text, true;
  return;
 end if;
 insert into public.host_contact_reveals(viewer_id, host_id, day) values (me, host, today) on conflict do nothing;
 return query select host_phone, host_email, false;
end;
$$;
revoke all on function public.reveal_host_contacts(uuid) from public, anon;
grant execute on function public.reveal_host_contacts(uuid) to authenticated;
commit;

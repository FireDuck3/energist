begin;
-- Адмінпанель (#/admin): модерація точок, перевірка господарів, скарги, проблемні бронювання,
-- помилки синхронізації станцій і блокування акаунтів.
-- Кожна дія перевіряється на сервері: функції admin_* починаються з require_admin(), а список
-- адміністраторів клієнт не може ні прочитати, ні змінити. Інтерфейс лише ховає кнопки.
--
-- Порядок розгортання: спершу ця міграція, потім сайт (сайт читає нові колонки hidden_at/hidden_reason).
-- Першого адміністратора додають у SQL Editor:
--   insert into public.admins(user_id) select id from public.users where email = 'admin@example.com';

-- ---- Хто адміністратор ----
create table public.admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Заблокований адміністратор — уже не адміністратор.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and public.account_is_active()
  and exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
 return auth.uid();
end;
$$;
revoke all on function public.require_admin() from public, anon, authenticated;

-- ---- Журнал дій адміністраторів ----
create table public.admin_actions (
 id bigint generated always as identity primary key,
 admin_id uuid not null references auth.users(id),
 action text not null,
 target_type text not null check (target_type in ('spot', 'user', 'report', 'booking')),
 target_id text not null,
 note text not null default '' check (char_length(note) <= 500),
 created_at timestamptz not null default now()
);
create index admin_actions_time on public.admin_actions(created_at desc);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

create function public.admin_log(act text, kind text, target text, note text) returns void
language sql security definer set search_path = '' as $$
 insert into public.admin_actions(admin_id, action, target_type, target_id, note)
 values (auth.uid(), act, kind, target, left(btrim(coalesce(note, '')), 500));
$$;
revoke all on function public.admin_log(text, text, text, text) from public, anon, authenticated;

-- ---- Модерація точок ----
-- hidden_at — точку сховав адміністратор (з причиною). owner_blocked — власника заблоковано;
-- тримає його тригер на users.status, тож політика читання не звертається до users.
alter table public.pilot_spots
 add column hidden_at timestamptz,
 add column hidden_reason text check (char_length(hidden_reason) <= 500),
 add column owner_blocked boolean not null default false;
-- Причину бачить господар у своєму кабінеті; іншим прихований рядок не віддає політика нижче.
grant select (hidden_at, hidden_reason, owner_blocked) on public.pilot_spots to anon, authenticated;

update public.pilot_spots s set owner_blocked = true
where exists (select 1 from public.users u where u.id = s.owner_id and u.status <> 'active');

create function public.sync_owner_blocked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 update public.pilot_spots set owner_blocked = (new.status <> 'active') where owner_id = new.id;
 return new;
end;
$$;
revoke all on function public.sync_owner_blocked() from public, anon, authenticated;
create trigger sync_owner_blocked after update of status on public.users
 for each row when (old.status is distinct from new.status) execute function public.sync_owner_blocked();

-- Приховану точку й точки заблокованого господаря бачить лише власник.
drop policy "Read pilot points" on public.pilot_spots;
create policy "Read pilot points" on public.pilot_spots for select to anon, authenticated
 using (owner_id = auth.uid()
  or (archived_at is null and hidden_at is null and not owner_blocked
   and (not paused or public.has_active_pilot_booking(id))));

-- Нові бронювання — лише на видиму точку (тригер стоїть перед кожним insert у pilot_bookings).
create or replace function public.require_active_pilot_spot() returns trigger
language plpgsql set search_path = '' as $$
begin
 perform 1 from public.pilot_spots
 where id = new.spot_id and archived_at is null and hidden_at is null and not owner_blocked for share;
 if not found then raise exception 'Point is no longer available' using errcode = '22023'; end if;
 return new;
end;
$$;

-- ---- Огляд ----
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare kyiv_now timestamp := now() at time zone 'Europe/Kyiv';
begin
 perform public.require_admin();
 return jsonb_build_object(
  'users', (select count(*) from public.users),
  'blocked_users', (select count(*) from public.users where status <> 'active'),
  'hosts', (select count(distinct owner_id) from public.pilot_spots where archived_at is null),
  'verified_hosts', (select count(*) from public.users where verified_at is not null),
  'spots', (select count(*) from public.pilot_spots where archived_at is null),
  'hidden_spots', (select count(*) from public.pilot_spots where archived_at is null and hidden_at is not null),
  'unverified_spots', (select count(*) from public.pilot_spots where archived_at is null and hidden_at is null and verified_at is null),
  'open_reports', (select count(*) from public.reports where status = 'open'),
  'bookings_30d', (select count(*) from public.pilot_bookings where created_at > now() - interval '30 days'),
  'completed_30d', (select count(*) from public.pilot_bookings where status = 'completed' and created_at > now() - interval '30 days'),
  'problem_bookings', (select count(*) from public.pilot_bookings b where b.created_at > now() - interval '60 days' and (
    exists (select 1 from public.reports r where r.booking_id = b.id and r.status = 'open')
    or (b.status = 'pending' and (lower(b.slot) <= kyiv_now or b.created_at < now() - interval '24 hours'))
    or (b.status = 'confirmed' and upper(b.slot) < kyiv_now - interval '24 hours'))),
  'sync_errors_7d', (select count(*) from public.station_sync_runs where error is not null and started_at > now() - interval '7 days'),
  'last_sync', (select to_jsonb(r) from (select started_at, finished_at, source, fetched, inserted, updated, skipped, error
    from public.station_sync_runs order by started_at desc limit 1) r)
 );
end;
$$;

-- ---- Скарги ----
create function public.admin_list_reports(include_closed boolean default false)
returns table (id uuid, created_at timestamptz, status text, target_type text, target_id text, target_label text,
 target_state text, reason text, details text, booking_id uuid, reporter_name text, reporter_email text,
 resolution text, resolved_at timestamptz, same_target_open bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
 perform public.require_admin();
 return query
 select r.id, r.created_at, r.status, r.target_type, r.target_id, t.label, t.state, r.reason, r.details, r.booking_id,
  btrim(ru.first_name || ' ' || ru.last_name), ru.email, r.resolution, r.resolved_at,
  (select count(*) from public.reports o where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'open')
 from public.reports r
 left join public.users ru on ru.id = r.reporter_id
 left join lateral (
  select s.title || ' · ' || s.district as label,
   case when s.archived_at is not null then 'archived' when s.hidden_at is not null then 'hidden' else 'active' end as state
  from public.pilot_spots s where r.target_type = 'spot' and s.id::text = r.target_id
  union all
  select coalesce(p.name, p.address, 'Публічна станція'), case when p.is_active then 'active' else 'inactive' end
  from public.public_charging_stations p where r.target_type = 'station' and p.id::text = r.target_id
  union all
  select btrim(u.first_name || ' ' || u.last_name) || ' · ' || u.email, u.status
  from public.users u where r.target_type = 'user' and u.id::text = r.target_id
 ) t on true
 where include_closed or r.status = 'open'
 order by (r.status = 'open') desc, r.created_at desc
 limit 300;
end;
$$;

create function public.admin_resolve_report(report_id uuid, decision text, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(coalesce(note, ''));
begin
 perform public.require_admin();
 if decision not in ('resolved', 'rejected') or char_length(clean) > 500 then
  raise exception 'bad_input' using errcode = '22023';
 end if;
 update public.reports set status = decision, resolved_at = now(), resolution = nullif(clean, '')
 where id = report_id and status = 'open';
 if not found then raise exception 'not_open' using errcode = '22023'; end if;
 perform public.admin_log('report_' || decision, 'report', report_id::text, clean);
end;
$$;

-- ---- Точки ----
-- Точні координати адміністратор бачить тут: щоб перевірити адресу за скаргою.
create function public.admin_list_spots()
returns table (id uuid, title text, district text, lat numeric, lng numeric, owner_id uuid, owner_name text,
 owner_email text, owner_status text, owner_verified boolean, verified_at timestamptz, hidden_at timestamptz,
 hidden_reason text, archived_at timestamptz, paused boolean, open_reports bigint, completed_bookings bigint,
 active_bookings bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
 perform public.require_admin();
 return query
 select s.id, s.title, s.district, s.lat, s.lng, s.owner_id, btrim(u.first_name || ' ' || u.last_name), u.email,
  u.status, u.verified_at is not null, s.verified_at, s.hidden_at, s.hidden_reason, s.archived_at, s.paused,
  (select count(*) from public.reports r where r.target_type = 'spot' and r.target_id = s.id::text and r.status = 'open'),
  (select count(*) from public.pilot_bookings b where b.spot_id = s.id and b.status = 'completed'),
  (select count(*) from public.pilot_bookings b where b.spot_id = s.id and b.status in ('pending', 'confirmed'))
 from public.pilot_spots s
 left join public.users u on u.id = s.owner_id
 order by (s.archived_at is not null), s.title;
end;
$$;

-- Сховати точку з карти (з причиною, її побачить господар) або повернути. Майбутні бронювання скасовуються.
create function public.admin_set_spot_hidden(point_id uuid, hide boolean, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(coalesce(reason, ''));
begin
 perform public.require_admin();
 if hide is null or (hide and char_length(clean) not between 3 and 500) then
  raise exception 'bad_reason' using errcode = '22023';
 end if;
 update public.pilot_spots
 set hidden_at = case when hide then coalesce(hidden_at, now()) end, hidden_reason = case when hide then clean end
 where id = point_id;
 if not found then raise exception 'bad_target' using errcode = '22023'; end if;
 if hide then
  update public.pilot_bookings set status = 'cancelled'
  where spot_id = point_id and status in ('pending', 'confirmed') and upper(slot) > (now() at time zone 'Europe/Kyiv');
 end if;
 perform public.admin_log(case when hide then 'spot_hide' else 'spot_show' end, 'spot', point_id::text, clean);
end;
$$;

create function public.admin_set_spot_verified(point_id uuid, verified boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_admin();
 update public.pilot_spots set verified_at = case when verified then coalesce(verified_at, now()) end where id = point_id;
 if not found then raise exception 'bad_target' using errcode = '22023'; end if;
 perform public.admin_log(case when verified then 'spot_verify' else 'spot_unverify' end, 'spot', point_id::text, '');
end;
$$;

-- ---- Користувачі ----
create function public.admin_list_users(search text default '')
returns table (id uuid, first_name text, last_name text, email text, nickname text, role text, phone text, status text,
 verified_at timestamptz, registered_at timestamptz, last_sign_in_at timestamptz, is_admin boolean, spots bigint,
 guest_bookings bigint, open_reports bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare q text := lower(left(btrim(coalesce(search, '')), 100));
begin
 perform public.require_admin();
 return query
 select u.id, u.first_name, u.last_name, u.email, p.name, p.role, p.phone, u.status, u.verified_at, u.registered_at,
  au.last_sign_in_at, exists (select 1 from public.admins a where a.user_id = u.id),
  (select count(*) from public.pilot_spots s where s.owner_id = u.id and s.archived_at is null),
  (select count(*) from public.pilot_bookings b where b.guest_id = u.id),
  (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = u.id::text and r.status = 'open')
 from public.users u
 left join public.profiles p on p.id = u.id
 left join auth.users au on au.id = u.id
 where q = '' or strpos(lower(u.email), q) > 0 or strpos(lower(u.first_name || ' ' || u.last_name), q) > 0
  or strpos(lower(coalesce(p.name, '')), q) > 0 or u.id::text = q
 order by u.registered_at desc
 limit 200;
end;
$$;

-- Заблокувати (suspended) або розблокувати. Блокування скасовує майбутні бронювання людини —
-- і як гостя, і на її точках; точки зникають з карти через owner_blocked.
create function public.admin_set_user_status(target uuid, new_status text, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_admin(); clean text := btrim(coalesce(note, ''));
begin
 if new_status not in ('active', 'suspended') or char_length(clean) > 500 then
  raise exception 'bad_input' using errcode = '22023';
 end if;
 if target = me then raise exception 'self' using errcode = '22023'; end if;
 if new_status = 'suspended' then
  if exists (select 1 from public.admins a where a.user_id = target) then
   raise exception 'admin_target' using errcode = '22023';
  end if;
  if char_length(clean) < 3 then raise exception 'bad_reason' using errcode = '22023'; end if;
 end if;
 update public.users set status = new_status where id = target;
 if not found then raise exception 'bad_target' using errcode = '22023'; end if;
 if new_status = 'suspended' then
  update public.pilot_bookings b set status = 'cancelled'
  where b.status in ('pending', 'confirmed') and upper(b.slot) > (now() at time zone 'Europe/Kyiv')
   and (b.guest_id = target or exists (select 1 from public.pilot_spots s where s.id = b.spot_id and s.owner_id = target));
 end if;
 perform public.admin_log(case when new_status = 'suspended' then 'user_block' else 'user_unblock' end, 'user', target::text, clean);
end;
$$;

-- Позначка «✓ Перевірений господар» на картці точки.
create function public.admin_set_host_verified(target uuid, verified boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_admin();
 update public.users set verified_at = case when verified then coalesce(verified_at, now()) end where id = target;
 if not found then raise exception 'bad_target' using errcode = '22023'; end if;
 perform public.admin_log(case when verified then 'host_verify' else 'host_unverify' end, 'user', target::text, '');
end;
$$;

-- ---- Бронювання ----
-- Онлайн-оплати ще немає, тож «проблемні транзакції» — це бронювання, що застрягли або мають скаргу:
-- reported — відкрита скарга по бронюванню; stale_pending — господар не відповів добу або час уже минув;
-- not_completed — підтверджене, але через добу після кінця так і не завершене.
create function public.admin_list_bookings(problems_only boolean default true)
returns table (id uuid, created_at timestamptz, status text, status_changed_at timestamptz, starts_at timestamp,
 ends_at timestamp, device text, spot_id uuid, spot_title text, host_id uuid, host_name text, host_email text,
 guest_id uuid, guest_name text, guest_email text, problem text, open_reports bigint, messages bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare kyiv_now timestamp := now() at time zone 'Europe/Kyiv';
begin
 perform public.require_admin();
 return query
 select x.* from (
  select b.id, b.created_at, b.status, b.status_changed_at, lower(b.slot) as starts_at, upper(b.slot) as ends_at,
   b.device, s.id as spot_id, s.title as spot_title, s.owner_id as host_id,
   btrim(hu.first_name || ' ' || hu.last_name) as host_name, hu.email as host_email,
   b.guest_id, btrim(gu.first_name || ' ' || gu.last_name) as guest_name, gu.email as guest_email,
   case
    when exists (select 1 from public.reports r where r.booking_id = b.id and r.status = 'open') then 'reported'
    when b.status = 'pending' and (lower(b.slot) <= kyiv_now or b.created_at < now() - interval '24 hours') then 'stale_pending'
    when b.status = 'confirmed' and upper(b.slot) < kyiv_now - interval '24 hours' then 'not_completed'
   end as problem,
   (select count(*) from public.reports r where r.booking_id = b.id and r.status = 'open') as open_reports,
   (select count(*) from public.booking_messages m where m.booking_id = b.id) as messages
  from public.pilot_bookings b
  join public.pilot_spots s on s.id = b.spot_id
  left join public.users hu on hu.id = s.owner_id
  left join public.users gu on gu.id = b.guest_id
  where b.created_at > now() - interval '60 days'
 ) x
 where not problems_only or x.problem is not null
 order by x.created_at desc
 limit 300;
end;
$$;

create function public.admin_cancel_booking(booking_id uuid, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(coalesce(note, ''));
begin
 perform public.require_admin();
 if char_length(clean) > 500 then raise exception 'bad_input' using errcode = '22023'; end if;
 update public.pilot_bookings set status = 'cancelled' where id = booking_id and status in ('pending', 'confirmed');
 if not found then raise exception 'not_active' using errcode = '22023'; end if;
 perform public.admin_log('booking_cancel', 'booking', booking_id::text, clean);
end;
$$;

-- ---- Помилки синхронізації станцій і журнал ----
create function public.admin_list_sync_runs()
returns table (id uuid, started_at timestamptz, finished_at timestamptz, source text, fetched integer, inserted integer,
 updated integer, skipped integer, error text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
 perform public.require_admin();
 return query
 select r.id, r.started_at, r.finished_at, r.source, r.fetched, r.inserted, r.updated, r.skipped, r.error
 from public.station_sync_runs r order by r.started_at desc limit 20;
end;
$$;

create function public.admin_list_actions()
returns table (id bigint, created_at timestamptz, admin_name text, action text, target_type text, target_id text, note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
 perform public.require_admin();
 return query
 select a.id, a.created_at, btrim(u.first_name || ' ' || u.last_name), a.action, a.target_type, a.target_id, a.note
 from public.admin_actions a left join public.users u on u.id = a.admin_id
 order by a.created_at desc limit 100;
end;
$$;

-- Supabase за замовчуванням дає anon право виконувати нові функції: забираємо явно.
do $$
declare f text;
begin
 foreach f in array array[
  'admin_overview()', 'admin_list_reports(boolean)', 'admin_resolve_report(uuid,text,text)', 'admin_list_spots()',
  'admin_set_spot_hidden(uuid,boolean,text)', 'admin_set_spot_verified(uuid,boolean)', 'admin_list_users(text)',
  'admin_set_user_status(uuid,text,text)', 'admin_set_host_verified(uuid,boolean)', 'admin_list_bookings(boolean)',
  'admin_cancel_booking(uuid,text)', 'admin_list_sync_runs()', 'admin_list_actions()'
 ] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
 end loop;
end;
$$;
commit;

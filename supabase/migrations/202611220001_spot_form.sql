begin;
-- Анкета точки (15 полів, docs/host-data.md): фото господаря, опис і тип СЕС, встановлена потужність,
-- наявність зарядної станції (EVSE) з конекторами CCS2/CHAdeMO і потужністю до 150 кВт, тип паркування.

-- ---- Конектор і потужність: ширші межі для зарядних станцій ----
-- Старі обмеження створені inline (імена генерує Postgres), тож шукаємо їх за визначенням.
do $$
declare c record;
begin
 for c in select conname from pg_constraint
  where conrelid = 'public.pilot_spots'::regclass and contype = 'c'
   and (pg_get_constraintdef(oid) like '%connector%' or pg_get_constraintdef(oid) like '%power_kw%')
 loop
  execute format('alter table public.pilot_spots drop constraint %I', c.conname);
 end loop;
end;
$$;
alter table public.pilot_spots
 add constraint pilot_spots_connector_check check (connector in ('type2', 'ccs2', 'chademo', 'socket220', 'usb')),
 add constraint pilot_spots_power_kw_check check (power_kw between 0.5 and 150);

-- ---- Нові поля станції ----
alter table public.pilot_spots
 add column description text check (char_length(description) <= 500),
 add column ses_type text check (ses_type in ('on_grid', 'off_grid', 'hybrid')),
 add column ses_power_kw numeric check (ses_power_kw between 0.1 and 1000),
 add column has_evse boolean,
 add column parking_type text check (parking_type in ('street', 'yard', 'garage', 'lot'));

grant insert (description, ses_type, ses_power_kw, has_evse, parking_type) on public.pilot_spots to authenticated;

-- Редагування анкети. Зміна потужності СЕС чи наявності зарядної станції знімає позначку «перевірена».
create function public.update_pilot_spot_form(point_id uuid, new_description text, new_ses_type text,
 new_ses_power_kw numeric, new_has_evse boolean, new_parking_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_own_pilot_spot(point_id);
 update public.pilot_spots set description = nullif(btrim(coalesce(new_description, '')), ''),
  ses_type = new_ses_type, ses_power_kw = new_ses_power_kw, has_evse = new_has_evse, parking_type = new_parking_type,
  verified_at = case when (ses_power_kw, has_evse) is distinct from (new_ses_power_kw, new_has_evse) then null else verified_at end
 where id = point_id;
end;
$$;
revoke all on function public.update_pilot_spot_form(uuid,text,text,numeric,boolean,text) from public, anon;
grant execute on function public.update_pilot_spot_form(uuid,text,text,numeric,boolean,text) to authenticated;

-- ---- Господар: ім'я, прізвище, телефон і фото ----
-- Фото лежить у публічному бакеті spot-photos у теці <uid>/avatar/ (політики бакета вже дозволяють власнику).
alter table public.profiles add column avatar_path text
 check (avatar_path is null or (char_length(avatar_path) <= 300 and avatar_path ~ '\.(jpg|png|webp)$'));

-- users клієнт змінювати не може, тож ім'я й прізвище оновлює лише ця функція (з тими ж перевірками, що й реєстрація).
create function public.set_my_host_contact(new_first_name text, new_last_name text, new_phone text, new_avatar_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
 f text := btrim(coalesce(new_first_name, ''));
 l text := btrim(coalesce(new_last_name, ''));
 prefix text := auth.uid()::text || '/avatar/';
begin
 if me is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 if char_length(f) not between 1 and 60 or char_length(l) not between 1 and 60
  or f ~ '[[:cntrl:]]' or l ~ '[[:cntrl:]]' then
  raise exception 'Invalid name' using errcode = '22023';
 end if;
 if new_avatar_path is not null and (left(new_avatar_path, length(prefix)) <> prefix or new_avatar_path like '%..%') then
  raise exception 'Invalid avatar path' using errcode = '22023';
 end if;
 update public.profiles set phone = new_phone, avatar_path = new_avatar_path where id = me;
 if not found then raise exception 'Profile required' using errcode = '22023'; end if;
 update public.users set first_name = f, last_name = l where id = me;
end;
$$;
revoke all on function public.set_my_host_contact(text,text,text,text) from public, anon;
grant execute on function public.set_my_host_contact(text,text,text,text) to authenticated;

-- ---- Картка господаря: + фото ----
-- Новий стовпець у результаті → функцію треба перестворити (create or replace не змінює тип результату).
drop function public.pilot_spot_host_card(uuid);
create function public.pilot_spot_host_card(point_id uuid)
returns table (host_name text, registered_at timestamptz, host_verified boolean, phone text, email text,
 completed_sessions integer, recent_hours numeric[], avatar_path text)
language sql stable security definer set search_path = '' as $$
 with spot as (
  select s.id, s.owner_id from public.pilot_spots s
  where s.id = point_id
   and ((s.archived_at is null and not s.paused) or s.owner_id = auth.uid()
    or (s.archived_at is null and public.has_active_pilot_booking(s.id)))
 ), done as (
  select upper(b.slot) as ended, extract(epoch from upper(b.slot) - lower(b.slot)) / 3600 as hours
  from public.pilot_bookings b where b.spot_id = point_id and b.status = 'completed'
 ), access as (
  select auth.uid() is not null and (
   exists (select 1 from spot where owner_id = auth.uid())
   or exists (select 1 from public.pilot_bookings b where b.spot_id = point_id and b.guest_id = auth.uid()
    and b.status in ('confirmed', 'completed'))) as allowed
 )
 select coalesce(nullif(btrim(p.name), ''), 'Господар точки'), u.registered_at, u.verified_at is not null,
  case when a.allowed and u.status = 'active' then p.phone end,
  case when a.allowed and u.status = 'active' then u.email end,
  (select count(*)::integer from done),
  coalesce((select array_agg(round(d.hours::numeric, 1) order by d.ended desc)
   from (select * from done order by ended desc limit 5) d), '{}'),
  p.avatar_path
 from spot s
 join public.users u on u.id = s.owner_id
 left join public.profiles p on p.id = s.owner_id
 cross join access a;
$$;
revoke all on function public.pilot_spot_host_card(uuid) from public;
grant execute on function public.pilot_spot_host_card(uuid) to anon, authenticated;
commit;

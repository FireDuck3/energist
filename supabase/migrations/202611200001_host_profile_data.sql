begin;
-- Дані господаря зі спринту (див. docs/host-data.md): контакти й верифікація господаря,
-- технічні характеристики станції, фізичні умови та «паспорт» господаря на картці точки.

-- ---- Господар: телефон (приватний) і верифікація профілю (ставить лише адміністратор) ----
-- Профіль читає й змінює лише власник (наявні політики profiles); іншим телефон віддає
-- тільки pilot_spot_host_card і лише гостю з підтвердженим бронюванням.
alter table public.profiles add column phone text check (phone is null or phone ~ '^\+?[0-9]{7,15}$');
-- Клієнт не має права змінювати users, тож позначку може поставити лише адміністратор (SQL / service_role).
alter table public.users add column verified_at timestamptz;

-- ---- Станція: технічні характеристики й фізичні умови ----
alter table public.pilot_spots
  add column install_year smallint check (install_year between 1990 and 2100),
  add column voltage_v smallint check (voltage_v between 100 and 1000),
  add column inverter text check (char_length(inverter) <= 100),
  add column storage_kwh numeric check (storage_kwh between 0 and 500),
  add column charging_terms text check (char_length(charging_terms) <= 500),
  add column has_wifi boolean,
  add column territory text check (territory in ('guarded', 'fenced', 'cctv', 'open')),
  add column can_leave_car boolean;

-- Нова точка одразу з описом: це лише опис, позначку «перевірена» він не ставить.
grant insert (install_year, voltage_v, inverter, storage_kwh, charging_terms, has_wifi, territory, can_leave_car)
 on public.pilot_spots to authenticated;

-- Редагування опису. Зміна обладнання знімає позначку «перевірена»: перевіряли інше обладнання.
create function public.update_pilot_spot_details(point_id uuid, new_install_year smallint, new_voltage_v smallint,
 new_inverter text, new_storage_kwh numeric, new_charging_terms text, new_has_wifi boolean, new_territory text,
 new_can_leave_car boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare clean_inverter text := nullif(btrim(coalesce(new_inverter, '')), '');
begin
 perform public.require_own_pilot_spot(point_id);
 update public.pilot_spots set install_year = new_install_year, voltage_v = new_voltage_v,
  inverter = clean_inverter, storage_kwh = new_storage_kwh,
  charging_terms = nullif(btrim(coalesce(new_charging_terms, '')), ''),
  has_wifi = new_has_wifi, territory = new_territory, can_leave_car = new_can_leave_car,
  verified_at = case when (install_year, voltage_v, inverter, storage_kwh)
    is distinct from (new_install_year, new_voltage_v, clean_inverter, new_storage_kwh) then null else verified_at end
 where id = point_id;
end;
$$;
revoke all on function public.update_pilot_spot_details(uuid,smallint,smallint,text,numeric,text,boolean,text,boolean) from public, anon;
grant execute on function public.update_pilot_spot_details(uuid,smallint,smallint,text,numeric,text,boolean,text,boolean) to authenticated;

-- ---- Картка господаря на сторінці точки ----
-- Публічно: нік, дата реєстрації, верифікація, кількість і тривалість останніх завершених сесій.
-- Телефон і email — лише самому господарю та гостю з підтвердженим або завершеним бронюванням цієї точки.
create function public.pilot_spot_host_card(point_id uuid)
returns table (host_name text, registered_at timestamptz, host_verified boolean, phone text, email text,
 completed_sessions integer, recent_hours numeric[])
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
   from (select * from done order by ended desc limit 5) d), '{}')
 from spot s
 join public.users u on u.id = s.owner_id
 left join public.profiles p on p.id = s.owner_id
 cross join access a;
$$;
revoke all on function public.pilot_spot_host_card(uuid) from public;
grant execute on function public.pilot_spot_host_card(uuid) to anon, authenticated;
commit;

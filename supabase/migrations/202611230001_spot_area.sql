begin;
-- Приватність адреси, крок 1 з 2: приблизна зона точки й точне місце лише для тих, кому його вже можна знати.
-- Крок 2 (202611230002_hide_exact_location.sql) закриває колонки lat/lng від клієнтів —
-- його виконують ПІСЛЯ деплою сайту, який читає area_lat/area_lng.

-- Випадковий зсув точки, один раз на точку. Клієнтам не видається (крок 2 не дає на нього select),
-- тож з центру зони справжню точку не обчислити. Для наявних точок значення генерується для кожного рядка окремо.
alter table public.pilot_spots
  add column area_u double precision not null default (random() * 2 - 1),
  add column area_v double precision not null default (random() * 2 - 1);

-- Центр зони: справжня точка, зсунута до 200 м по кожній осі (0,0018° широти ≈ 200 м).
-- Справжня точка завжди в межах ~283 м від центру — сайт малює коло 300 м.
-- Господар пересунув точку — зона рухається разом із нею (зсув той самий).
alter table public.pilot_spots
  add column area_lat numeric generated always as (round((lat::float8 + area_u * 0.0018)::numeric, 5)) stored,
  add column area_lng numeric generated always as
    (round((lng::float8 + area_v * 0.0018 / greatest(cos(radians(lat::float8)), 0.2))::numeric, 5)) stored;

-- Точне місце: господарю — усіх його точок; гостю — точок, де його бронювання підтверджене або завершене.
create or replace function public.my_exact_spot_locations()
returns table (spot_id uuid, lat numeric, lng numeric)
language sql stable security definer set search_path = '' as $$
  select s.id, s.lat, s.lng
  from public.pilot_spots s
  where auth.uid() is not null
    and (s.owner_id = auth.uid() or exists (
      select 1 from public.pilot_bookings b
      where b.spot_id = s.id and b.guest_id = auth.uid() and b.status in ('confirmed', 'completed')));
$$;
revoke all on function public.my_exact_spot_locations() from public, anon;
grant execute on function public.my_exact_spot_locations() to authenticated;

-- Редагування: null у координатах — «місце не змінювали». Сайт так робить, якщо точного місця
-- під рукою немає (не завантажилось), щоб не записати центр зони замість справжньої точки.
create or replace function public.update_pilot_spot(point_id uuid, new_title text, new_district text, new_lat numeric, new_lng numeric,
 new_source text, new_connector text, new_power_kw numeric, new_price numeric, new_devices text[], new_opens time, new_closes time)
returns void language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_own_pilot_spot(point_id);
 if (new_lat is null) <> (new_lng is null) then
  raise exception 'Both coordinates or neither' using errcode = '22023';
 end if;
 update public.pilot_spots set title = btrim(new_title), district = btrim(new_district),
  lat = coalesce(new_lat, lat), lng = coalesce(new_lng, lng),
  source = new_source, connector = new_connector, power_kw = new_power_kw, price_per_kwh = new_price,
  devices = new_devices, opens = new_opens, closes = new_closes,
  verified_at = case when lat is distinct from coalesce(new_lat, lat) or lng is distinct from coalesce(new_lng, lng)
    or connector is distinct from new_connector or power_kw is distinct from new_power_kw then null else verified_at end
 where id = point_id;
end;
$$;
commit;

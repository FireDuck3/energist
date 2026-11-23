begin;
-- Приватність адреси, крок 2 з 2: клієнти більше не можуть прочитати точні lat/lng і випадковий зсув зони.
-- Виконувати ПІСЛЯ деплою сайту, що читає area_lat/area_lng (старий сайт робить select=* і отримає відмову).
-- Точне місце тепер дає лише public.my_exact_spot_locations() (крок 1).
-- Нова колонка pilot_spots, яку мають бачити всі, потребує власного grant select (col) нижче.
revoke select on public.pilot_spots from anon, authenticated;
grant select (id, owner_id, title, district, area_lat, area_lng, source, connector, power_kw, price_per_kwh, devices,
  opens, closes, archived_at, paused, closed_weekdays, photos, verified_at,
  install_year, voltage_v, inverter, storage_kwh, charging_terms, has_wifi, territory, can_leave_car,
  description, ses_type, ses_power_kw, has_evse, parking_type)
  on public.pilot_spots to anon, authenticated;
commit;

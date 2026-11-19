begin;
-- Публічний бакет для стислого знімка станцій (stations-v1.json). Читати можуть усі (через CDN),
-- писати — лише service_role (щоденна синхронізація); політик на запис для клієнтів немає.
insert into storage.buckets (id, name, public) values ('public-data', 'public-data', true)
on conflict (id) do nothing;
commit;

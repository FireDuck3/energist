begin;
-- Public EV charging stations imported daily from Open Charge Map and OpenStreetMap.
-- Written only by the sync job (service_role); everyone may read active rows.
create table public.public_charging_stations (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ocm','osm','merged')),
  external_id text not null,
  name text,
  address text,
  operator text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  max_power_kw numeric,
  connectors jsonb not null default '[]'::jsonb,
  price_per_kwh numeric,
  price_verified boolean not null default false,
  opening_hours text,
  access text,
  operator_url text,
  status text not null default 'unknown' check (status = 'unknown'),
  sources jsonb not null default '[]'::jsonb,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  missed_runs integer not null default 0,
  unique (source, external_id)
);
create index public_charging_stations_geo_idx on public.public_charging_stations (lat, lng);
create index public_charging_stations_active_idx on public.public_charging_stations (is_active);
alter table public.public_charging_stations enable row level security;
create policy public_stations_read on public.public_charging_stations
  for select to anon, authenticated using (is_active);

create table public.station_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null,
  fetched integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  error text
);
alter table public.station_sync_runs enable row level security;
commit;

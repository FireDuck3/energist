-- WattWay: профілі користувачів. Виконується один раз у Supabase → SQL Editor.
-- Кожен бачить і змінює лише свій рядок; видалення з клієнта заборонене.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  role text not null check (role in ('guest', 'host')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile: read" on public.profiles
  for select using (auth.uid() = id);

create policy "own profile: insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "own profile: update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Історія пошуку (запити й переглянуті точки) і зарядок. Кожен бачить і додає лише своє;
-- пошук можна видаляти, зарядки — ні.

create table if not exists public.search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('query', 'spot')),
  value text not null check (char_length(value) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table public.search_history enable row level security;
create policy "own searches: read" on public.search_history for select using (auth.uid() = user_id);
create policy "own searches: insert" on public.search_history for insert with check (auth.uid() = user_id);
create policy "own searches: delete" on public.search_history for delete using (auth.uid() = user_id);
create index if not exists search_history_user_time on public.search_history (user_id, created_at desc);

create table if not exists public.charge_history (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spot_id text not null check (char_length(spot_id) between 1 and 80),
  spot_title text not null check (char_length(spot_title) between 1 and 120),
  district text not null default '',
  kwh numeric(8, 2) not null check (kwh > 0),
  total numeric(10, 2) not null check (total >= 0),
  charged_at timestamptz not null default now()
);
alter table public.charge_history enable row level security;
create policy "own charges: read" on public.charge_history for select using (auth.uid() = user_id);
create policy "own charges: insert" on public.charge_history for insert with check (auth.uid() = user_id);
create index if not exists charge_history_user_time on public.charge_history (user_id, charged_at desc);

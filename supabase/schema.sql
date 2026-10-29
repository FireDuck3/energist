-- ЕнерГість: профілі користувачів. Виконується один раз у Supabase → SQL Editor.
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

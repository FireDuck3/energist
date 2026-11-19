begin;
-- Етап 4б: «Перевірена точка» і скарги (на точки, публічні станції, користувачів).

-- ---- Перевірена точка: ставить лише адміністратор (service_role / SQL) ----
alter table public.pilot_spots add column verified_at timestamptz;

-- Господар створює точку прямим insert; дозволяємо лише колонки форми, щоб не можна було
-- одразу вписати verified_at, archived_at, paused чи photos в обхід серверних перевірок.
revoke insert on public.pilot_spots from authenticated;
grant insert (owner_id, title, district, lat, lng, source, connector, power_kw, price_per_kwh, devices, opens, closes)
 on public.pilot_spots to authenticated;

-- Зміна адреси чи обладнання знімає позначку: перевіряли вже не те місце/не те обладнання.
create or replace function public.update_pilot_spot(point_id uuid, new_title text, new_district text, new_lat numeric, new_lng numeric,
 new_source text, new_connector text, new_power_kw numeric, new_price numeric, new_devices text[], new_opens time, new_closes time)
returns void language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_own_pilot_spot(point_id);
 update public.pilot_spots set title = btrim(new_title), district = btrim(new_district), lat = new_lat, lng = new_lng,
  source = new_source, connector = new_connector, power_kw = new_power_kw, price_per_kwh = new_price,
  devices = new_devices, opens = new_opens, closes = new_closes,
  verified_at = case when lat is distinct from new_lat or lng is distinct from new_lng
    or connector is distinct from new_connector or power_kw is distinct from new_power_kw then null else verified_at end
 where id = point_id;
end;
$$;

-- ---- Скарги ----
create table public.reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id),
 target_type text not null check (target_type in ('spot','station','user')),
 target_id text not null,
 booking_id uuid references public.pilot_bookings(id),
 reason text not null,
 details text not null default '' check (length(details) <= 1000),
 status text not null default 'open' check (status in ('open','resolved','rejected')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolution text
);
create unique index reports_one_open_per_target on public.reports(reporter_id, target_type, target_id) where status = 'open';
create index reports_reporter_time on public.reports(reporter_id, created_at);
create index reports_open on public.reports(status, created_at) where status = 'open';
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
create policy "Read own reports" on public.reports for select to authenticated using (reporter_id = auth.uid());

create function public.submit_report(target_type text, target_id text, reason text, details text, booking_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); clean text := btrim(coalesce(details, '')); new_id uuid;
begin
 if me is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 if not (
   (target_type = 'spot' and reason in ('wrong_address','wrong_equipment','not_working','unsafe','fraud','other'))
   or (target_type = 'station' and reason in ('wrong_address','wrong_equipment','not_working','other'))
   or (target_type = 'user' and reason in ('fraud','abuse','spam','no_show','other'))
 ) or (reason = 'other' and length(clean) < 10) or length(clean) > 1000 then
  raise exception 'bad_reason' using errcode = '22023';
 end if;

 if target_type = 'spot' then
  if exists (select 1 from public.pilot_spots s where s.id::text = target_id and s.owner_id = me) then
   raise exception 'own_spot' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pilot_spots s where s.id::text = target_id and s.archived_at is null) then
   raise exception 'bad_target' using errcode = '22023';
  end if;
 elsif target_type = 'station' then
  if not exists (select 1 from public.public_charging_stations p where p.id::text = target_id and p.is_active) then
   raise exception 'bad_target' using errcode = '22023';
  end if;
 else
  -- На людину — лише як на іншу сторону спільного бронювання.
  if booking_id is null or target_id = me::text or not exists (
    select 1 from public.pilot_bookings b join public.pilot_spots s on s.id = b.spot_id
    where b.id = submit_report.booking_id and me in (b.guest_id, s.owner_id)
      and target_id in (b.guest_id::text, s.owner_id::text)) then
   raise exception 'bad_target' using errcode = '22023';
  end if;
 end if;

 perform pg_advisory_xact_lock(hashtext('reports:' || me::text));
 if (select count(*) from public.reports r where r.reporter_id = me and r.created_at > now() - interval '1 day') >= 10 then
  raise exception 'daily_limit' using errcode = 'WW429';
 end if;
 begin
  insert into public.reports(reporter_id, target_type, target_id, booking_id, reason, details)
  values (me, target_type, target_id, case when target_type = 'user' then submit_report.booking_id end, reason, clean)
  returning id into new_id;
 exception when unique_violation then
  raise exception 'duplicate' using errcode = '23505';
 end;
 return new_id;
end;
$$;
revoke all on function public.submit_report(text,text,text,text,uuid) from public, anon;
grant execute on function public.submit_report(text,text,text,text,uuid) to authenticated;
commit;

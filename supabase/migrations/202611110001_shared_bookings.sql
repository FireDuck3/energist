begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.pilot_spots (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check (length(btrim(title)) between 1 and 100),
 district text not null check (length(btrim(district)) between 1 and 60),
 lat numeric not null check (lat between 49.17 and 49.29),
 lng numeric not null check (lng between 28.35 and 28.60),
 source text not null check (source in ('solar','battery','grid')),
 connector text not null check (connector in ('type2','socket220','usb')),
 power_kw numeric not null check (power_kw between 0.5 and 22),
 price_per_kwh numeric not null check (price_per_kwh between 5 and 25),
 devices text[] not null check (cardinality(devices) between 1 and 3 and devices <@ array['ev','ecoflow','gadget']),
 opens time not null,
 closes time not null check (closes > opens)
);
alter table public.pilot_spots enable row level security;
revoke all on public.pilot_spots from anon, authenticated;
grant select on public.pilot_spots to anon, authenticated;
grant insert on public.pilot_spots to authenticated;
create policy "Read pilot points" on public.pilot_spots for select to anon, authenticated using (true);
create policy "Publish own pilot point" on public.pilot_spots for insert to authenticated
 with check (owner_id = auth.uid() and public.account_is_active());

create table public.pilot_bookings (
 id uuid primary key default gen_random_uuid(),
 spot_id uuid not null references public.pilot_spots(id),
 guest_id uuid not null references auth.users(id),
 device text not null,
 slot tsrange not null,
 status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled')),
 created_at timestamptz not null default now(),
 exclude using gist (spot_id with =, slot with &&) where (status in ('pending','confirmed'))
);
alter table public.pilot_bookings enable row level security;
revoke all on public.pilot_bookings from anon, authenticated;
grant select on public.pilot_bookings to authenticated;
create policy "Read own pilot bookings" on public.pilot_bookings for select to authenticated using (
 public.account_is_active() and (guest_id = auth.uid() or exists (
  select 1 from public.pilot_spots s where s.id = spot_id and s.owner_id = auth.uid()
 ))
);
create index pilot_bookings_guest on public.pilot_bookings (guest_id);

create function public.request_pilot_booking(point_id uuid, requested_day date, starts time, hours integer, requested_device text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare point public.pilot_spots; begins timestamp; finishes timestamp; kyiv_now timestamp; booking_id uuid;
begin
 if auth.uid() is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 select * into point from public.pilot_spots where id = point_id;
 if not found or point.owner_id = auth.uid() then
  raise exception 'Invalid point' using errcode = '22023';
 end if;
 kyiv_now := now() at time zone 'Europe/Kyiv';
 begins := requested_day + starts;
 finishes := begins + make_interval(hours => hours);
 if begins is null or hours is null or hours not between 1 and 6 or starts <> date_trunc('hour',begins)::time
  or begins <= kyiv_now or requested_day > kyiv_now::date + 1
  or begins < requested_day + point.opens or finishes > requested_day + point.closes
  or requested_device is null or not (requested_device = any(point.devices)) then
  raise exception 'Invalid slot or device' using errcode = '22023';
 end if;
 insert into public.pilot_bookings(spot_id,guest_id,device,slot)
 values(point_id,auth.uid(),requested_device,tsrange(begins,finishes,'[)')) returning id into booking_id;
 return booking_id;
end;
$$;
revoke all on function public.request_pilot_booking(uuid,date,time,integer,text) from public, anon;
grant execute on function public.request_pilot_booking(uuid,date,time,integer,text) to authenticated;

create function public.respond_to_pilot_booking(booking_id uuid, decision text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 update public.pilot_bookings b set status = decision from public.pilot_spots s
 where b.id = booking_id and b.spot_id = s.id and (
   (decision in ('confirmed','declined') and b.status = 'pending' and s.owner_id = auth.uid()
    and (decision = 'declined' or lower(b.slot) > (now() at time zone 'Europe/Kyiv')))
   or (decision = 'cancelled' and b.status in ('pending','confirmed') and b.guest_id = auth.uid())
 );
 if not found then raise exception 'Booking cannot be changed' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.respond_to_pilot_booking(uuid,text) from public, anon;
grant execute on function public.respond_to_pilot_booking(uuid,text) to authenticated;
commit;

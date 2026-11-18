begin;
-- Етап 3: пауза, графік (неробочі дні тижня й вихідні), редагування точки, фото, доступність на 30 днів.

alter table public.pilot_spots
  add column paused boolean not null default false,
  add column closed_weekdays smallint[] not null default '{}' check (closed_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  add column photos text[] not null default '{}' check (cardinality(photos) <= 5);

-- Точку на паузі бачить лише її власник.
drop policy "Read pilot points" on public.pilot_spots;
create policy "Read pilot points" on public.pilot_spots for select to anon, authenticated
 using ((archived_at is null and not paused) or owner_id = auth.uid());

create table public.pilot_spot_days_off (
 spot_id uuid not null references public.pilot_spots(id),
 day date not null,
 primary key (spot_id, day)
);
alter table public.pilot_spot_days_off enable row level security;
revoke all on public.pilot_spot_days_off from anon, authenticated;
grant select on public.pilot_spot_days_off to anon, authenticated;
create policy "Read days off of visible points" on public.pilot_spot_days_off for select to anon, authenticated
 using (exists (select 1 from public.pilot_spots s where s.id = spot_id));

-- Спільна перевірка: викликає власник активного акаунта, точка не архівована.
create function public.require_own_pilot_spot(point_id uuid) returns public.pilot_spots
language plpgsql security definer set search_path = '' as $$
declare point public.pilot_spots;
begin
 if auth.uid() is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 select * into point from public.pilot_spots where id = point_id for update;
 if not found or point.owner_id <> auth.uid() or point.archived_at is not null then
  raise exception 'Point is not owned by current user' using errcode = '42501';
 end if;
 return point;
end;
$$;
revoke all on function public.require_own_pilot_spot(uuid) from public, anon, authenticated;

create function public.update_pilot_spot(point_id uuid, new_title text, new_district text, new_lat numeric, new_lng numeric,
 new_source text, new_connector text, new_power_kw numeric, new_price numeric, new_devices text[], new_opens time, new_closes time)
returns void language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_own_pilot_spot(point_id);
 -- Обмеження таблиці (довжина назви, діапазони, пристрої, opens < closes) перевіряють значення.
 update public.pilot_spots set title = btrim(new_title), district = btrim(new_district), lat = new_lat, lng = new_lng,
  source = new_source, connector = new_connector, power_kw = new_power_kw, price_per_kwh = new_price,
  devices = new_devices, opens = new_opens, closes = new_closes
 where id = point_id;
end;
$$;
revoke all on function public.update_pilot_spot(uuid,text,text,numeric,numeric,text,text,numeric,numeric,text[],time,time) from public, anon;
grant execute on function public.update_pilot_spot(uuid,text,text,numeric,numeric,text,text,numeric,numeric,text[],time,time) to authenticated;

create function public.set_pilot_spot_paused(point_id uuid, is_paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_own_pilot_spot(point_id);
 update public.pilot_spots set paused = coalesce(is_paused, false) where id = point_id;
end;
$$;
revoke all on function public.set_pilot_spot_paused(uuid,boolean) from public, anon;
grant execute on function public.set_pilot_spot_paused(uuid,boolean) to authenticated;

create function public.set_pilot_spot_schedule(point_id uuid, weekdays smallint[], days date[]) returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Europe/Kyiv')::date;
begin
 perform public.require_own_pilot_spot(point_id);
 if weekdays is null or not (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]) or cardinality(weekdays) > 6
  or exists (select 1 from unnest(coalesce(days, '{}')) d where d < today or d > today + 60) then
  raise exception 'Invalid schedule' using errcode = '22023';
 end if;
 update public.pilot_spots set closed_weekdays = (select coalesce(array_agg(distinct w order by w), '{}') from unnest(weekdays) w)
 where id = point_id;
 delete from public.pilot_spot_days_off where spot_id = point_id and day >= today;
 insert into public.pilot_spot_days_off(spot_id, day)
 select distinct point_id, d from unnest(coalesce(days, '{}')) d;
end;
$$;
revoke all on function public.set_pilot_spot_schedule(uuid,smallint[],date[]) from public, anon;
grant execute on function public.set_pilot_spot_schedule(uuid,smallint[],date[]) to authenticated;

create function public.set_pilot_spot_photos(point_id uuid, paths text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare prefix text := auth.uid()::text || '/' || point_id::text || '/';
begin
 perform public.require_own_pilot_spot(point_id);
 if paths is null or cardinality(paths) > 5 or exists (
   select 1 from unnest(paths) p where left(p, length(prefix)) <> prefix or p like '%..%' or p !~ '\.(jpg|png|webp)$') then
  raise exception 'Invalid photo paths' using errcode = '22023';
 end if;
 update public.pilot_spots set photos = paths where id = point_id;
end;
$$;
revoke all on function public.set_pilot_spot_photos(uuid,text[]) from public, anon;
grant execute on function public.set_pilot_spot_photos(uuid,text[]) to authenticated;

-- Зайняті інтервали без даних гостей: календар бачить лише «зайнято».
create function public.pilot_spot_availability(point_id uuid, from_day date, to_day date)
returns table (starts timestamp, ends timestamp)
language plpgsql stable security definer set search_path = '' as $$
begin
 if from_day is null or to_day is null or to_day < from_day or to_day - from_day > 31 then
  raise exception 'Invalid range' using errcode = '22023';
 end if;
 return query
  select lower(b.slot), upper(b.slot) from public.pilot_bookings b
  join public.pilot_spots s on s.id = b.spot_id
  where b.spot_id = point_id and b.status in ('pending','confirmed') and s.archived_at is null
   and b.slot && tsrange(from_day::timestamp, (to_day + 1)::timestamp, '[)')
  order by 1;
end;
$$;
revoke all on function public.pilot_spot_availability(uuid,date,date) from public;
grant execute on function public.pilot_spot_availability(uuid,date,date) to anon, authenticated;

create or replace function public.request_pilot_booking(point_id uuid, requested_day date, starts time, hours integer, requested_device text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare point public.pilot_spots; begins timestamp; finishes timestamp; kyiv_now timestamp; booking_id uuid;
begin
 if auth.uid() is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 select * into point from public.pilot_spots where id = point_id;
 if not found or point.owner_id = auth.uid() or point.paused or point.archived_at is not null then
  raise exception 'Invalid point' using errcode = '22023';
 end if;
 kyiv_now := now() at time zone 'Europe/Kyiv';
 begins := requested_day + starts;
 finishes := begins + make_interval(hours => hours);
 if begins is null or hours is null or hours not between 1 and 6 or starts <> date_trunc('hour',begins)::time
  or begins <= kyiv_now or requested_day > kyiv_now::date + 29
  or begins < requested_day + point.opens or finishes > requested_day + point.closes
  or extract(isodow from requested_day)::smallint = any(point.closed_weekdays)
  or exists (select 1 from public.pilot_spot_days_off d where d.spot_id = point_id and d.day = requested_day)
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

-- Фото: публічне читання, запис і видалення лише у власну теку <uid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spot-photos', 'spot-photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "Owners upload spot photos" on storage.objects for insert to authenticated
 with check (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owners delete spot photos" on storage.objects for delete to authenticated
 using (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text);
commit;

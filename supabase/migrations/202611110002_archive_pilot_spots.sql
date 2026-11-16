begin;
alter table public.pilot_spots add column archived_at timestamptz;

drop policy "Read pilot points" on public.pilot_spots;
create policy "Read pilot points" on public.pilot_spots for select to anon, authenticated
 using (archived_at is null or owner_id = auth.uid());

create function public.archive_pilot_spot(point_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 update public.pilot_spots set archived_at = coalesce(archived_at, now())
 where id = point_id and owner_id = auth.uid();
 if not found then raise exception 'Point is not owned by current user' using errcode = '42501'; end if;
 update public.pilot_bookings set status = 'cancelled'
 where spot_id = point_id and status in ('pending','confirmed')
   and upper(slot) > (now() at time zone 'Europe/Kyiv');
end;
$$;
revoke all on function public.archive_pilot_spot(uuid) from public, anon;
grant execute on function public.archive_pilot_spot(uuid) to authenticated;

create function public.require_active_pilot_spot() returns trigger
language plpgsql set search_path = '' as $$
begin
 perform 1 from public.pilot_spots where id = new.spot_id and archived_at is null for share;
 if not found then raise exception 'Point is no longer available' using errcode = '22023'; end if;
 return new;
end;
$$;
create trigger require_active_pilot_spot before insert on public.pilot_bookings
 for each row execute function public.require_active_pilot_spot();
commit;

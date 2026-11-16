begin;

create function public.list_my_pilot_bookings()
returns table (id uuid, spot_id uuid, guest_id uuid, owner_id uuid,
  slot tsrange, status text, counterpart_name text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.spot_id, b.guest_id, s.owner_id, b.slot, b.status::text, p.name
  from public.pilot_bookings b
  join public.pilot_spots s on s.id = b.spot_id
  left join public.profiles p on p.id =
    case when b.guest_id = auth.uid() then s.owner_id else b.guest_id end
  where public.account_is_active()
    and auth.uid() in (b.guest_id, s.owner_id)
  order by b.created_at desc;
$$;

revoke all on function public.list_my_pilot_bookings() from public, anon;
grant execute on function public.list_my_pilot_bookings() to authenticated;

commit;

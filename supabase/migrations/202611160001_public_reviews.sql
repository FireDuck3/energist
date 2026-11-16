begin;
-- Publish only guest feedback about a spot, never private messages or account identifiers.
create or replace function public.list_public_spot_reviews()
returns table (spot_id uuid, author_name text, rating integer, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select b.spot_id, coalesce(nullif(btrim(p.name), ''), 'Учасник WattWay'), r.rating, r.body, r.created_at
 from public.booking_reviews r
 join public.pilot_bookings b on b.id=r.booking_id and b.guest_id=r.author_id
 join public.pilot_spots s on s.id=b.spot_id
 left join public.profiles p on p.id=r.author_id
 where b.status='completed' and s.archived_at is null
 order by r.created_at desc;
$$;
revoke all on function public.list_public_spot_reviews() from public;
grant execute on function public.list_public_spot_reviews() to anon, authenticated;
commit;


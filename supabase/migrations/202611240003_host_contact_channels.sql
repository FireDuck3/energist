begin;
-- Бажані канали зв'язку господаря + контакти в картці господаря для будь-якого увійшлого користувача.

alter table public.profiles add column contact_channels text[] not null default '{}'
 check (contact_channels <@ array['chat','phone','telegram','viber','whatsapp','email']::text[] and cardinality(contact_channels) <= 6);

create function public.set_my_contact_channels(channels text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
 if me is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 if channels is null or not (channels <@ array['chat','phone','telegram','viber','whatsapp','email']::text[]) then
  raise exception 'Invalid channels' using errcode = '22023';
 end if;
 update public.profiles set contact_channels = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(channels) c)
 where id = me;
 if not found then raise exception 'Profile required' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.set_my_contact_channels(text[]) from public, anon;
grant execute on function public.set_my_contact_channels(text[]) to authenticated;

-- Картка господаря: телефон і email — будь-якому увійшлому активному користувачу (рішення команди:
-- гість бачить, як зв'язатися, ще до бронювання), анонімам — ні. Видимість точки — як у політиці читання.
drop function public.pilot_spot_host_card(uuid);
create function public.pilot_spot_host_card(point_id uuid)
returns table (host_name text, registered_at timestamptz, host_verified boolean, phone text, email text,
 completed_sessions integer, recent_hours numeric[], avatar_path text, contact_channels text[])
language sql stable security definer set search_path = '' as $$
 with spot as (
  select s.id, s.owner_id from public.pilot_spots s
  where s.id = point_id
   and (s.owner_id = auth.uid()
    or (s.archived_at is null and s.hidden_at is null and not s.owner_blocked
     and (not s.paused or public.has_active_pilot_booking(s.id))))
 ), done as (
  select upper(b.slot) as ended, extract(epoch from upper(b.slot) - lower(b.slot)) / 3600 as hours
  from public.pilot_bookings b where b.spot_id = point_id and b.status = 'completed'
 ), access as (
  select auth.uid() is not null and public.account_is_active() as allowed
 )
 select coalesce(nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
   nullif(btrim(p.name), ''), 'Господар точки'),
  u.registered_at, u.verified_at is not null,
  case when a.allowed and u.status = 'active' then p.phone end,
  case when a.allowed and u.status = 'active' then u.email end,
  (select count(*)::integer from done),
  coalesce((select array_agg(round(d.hours::numeric, 1) order by d.ended desc)
   from (select * from done order by ended desc limit 5) d), '{}'),
  p.avatar_path,
  coalesce(p.contact_channels, '{}')
 from spot s
 join public.users u on u.id = s.owner_id
 left join public.profiles p on p.id = s.owner_id
 cross join access a;
$$;
revoke all on function public.pilot_spot_host_card(uuid) from public;
grant execute on function public.pilot_spot_host_card(uuid) to anon, authenticated;
commit;

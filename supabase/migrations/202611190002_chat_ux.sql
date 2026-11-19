begin;
-- Чати «як у Telegram»: прев'ю, прочитаність співрозмовника (✓✓), системні рядки, канал «друкує…».

-- ---- Коли змінився статус бронювання (для системних рядків у чаті) ----
alter table public.pilot_bookings add column status_changed_at timestamptz;
create function public.stamp_booking_status() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.status is distinct from old.status then new.status_changed_at := now(); end if;
 return new;
end;
$$;
create trigger stamp_booking_status before update of status on public.pilot_bookings
 for each row execute function public.stamp_booking_status();

-- ---- Список чатів з прев'ю та прочитаністю співрозмовника ----
drop function public.list_my_chats();
create function public.list_my_chats()
returns table (id uuid, spot_id uuid, guest_id uuid, owner_id uuid, slot tsrange, status text, counterpart_name text,
  created_at timestamptz, status_changed_at timestamptz, spot_title text,
  last_message_at timestamptz, last_message_mine boolean, last_message_body text, unread_count integer,
  counterpart_last_read_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select b.id, b.spot_id, b.guest_id, s.owner_id, b.slot, b.status::text, p.name,
  b.created_at, b.status_changed_at, s.title,
  m.created_at, m.author_id = auth.uid(), left(m.body, 120),
  (select count(*)::integer from public.booking_messages x
    where x.booking_id = b.id and x.author_id <> auth.uid()
      and x.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
  cr.last_read_at
 from public.pilot_bookings b
 join public.pilot_spots s on s.id = b.spot_id
 left join public.profiles p on p.id = case when b.guest_id = auth.uid() then s.owner_id else b.guest_id end
 left join lateral (select x.created_at, x.author_id, x.body from public.booking_messages x
   where x.booking_id = b.id order by x.created_at desc limit 1) m on true
 left join public.booking_reads r on r.booking_id = b.id and r.user_id = auth.uid()
 left join public.booking_reads cr on cr.booking_id = b.id
   and cr.user_id = case when b.guest_id = auth.uid() then s.owner_id else b.guest_id end
 where public.account_is_active() and auth.uid() in (b.guest_id, s.owner_id)
 order by coalesce(m.created_at, b.created_at) desc;
$$;
revoke all on function public.list_my_chats() from public, anon;
grant execute on function public.list_my_chats() to authenticated;

-- ---- ✓✓: співрозмовник бачить, коли інший прочитав чат (лише в межах бронювання) ----
drop policy "Read own chat reads" on public.booking_reads;
create policy "Participants read chat reads" on public.booking_reads for select to authenticated
 using (user_id = auth.uid() or public.booking_participant(booking_id));
alter publication supabase_realtime add table public.booking_reads;

-- ---- «Друкує…»: приватні broadcast-канали chat:<booking_id> лише для учасників ----
create function public.chat_topic_booking(topic text) returns uuid
language sql immutable set search_path = '' as $$
 select case when topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then substring(topic from 6)::uuid end;
$$;
create policy "Chat participants receive typing" on realtime.messages for select to authenticated
 using (realtime.messages.extension = 'broadcast'
   and public.booking_participant(public.chat_topic_booking(realtime.topic())));
create policy "Chat participants send typing" on realtime.messages for insert to authenticated
 with check (realtime.messages.extension = 'broadcast'
   and public.booking_participant(public.chat_topic_booking(realtime.topic())));
commit;

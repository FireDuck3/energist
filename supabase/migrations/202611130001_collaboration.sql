begin;
alter table public.pilot_bookings drop constraint pilot_bookings_status_check;
alter table public.pilot_bookings add constraint pilot_bookings_status_check
 check (status in ('pending','confirmed','declined','cancelled','completed'));

create function public.booking_participant(booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.account_is_active() and exists (
  select 1 from public.pilot_bookings b join public.pilot_spots s on s.id=b.spot_id
  where b.id=booking and auth.uid() in (b.guest_id,s.owner_id));
$$;
revoke all on function public.booking_participant(uuid) from public, anon;
grant execute on function public.booking_participant(uuid) to authenticated;

create table public.booking_messages (
 id uuid primary key,
 booking_id uuid not null references public.pilot_bookings(id),
 author_id uuid not null default auth.uid() references auth.users(id),
 body text not null check (length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index booking_messages_order on public.booking_messages(booking_id,created_at);
alter table public.booking_messages enable row level security;
revoke all on public.booking_messages from anon, authenticated;
grant select, insert on public.booking_messages to authenticated;
create policy "Participants read messages" on public.booking_messages for select to authenticated
 using (public.booking_participant(booking_id));
create policy "Participants send messages" on public.booking_messages for insert to authenticated
 with check (author_id=auth.uid() and public.booking_participant(booking_id));

create table public.booking_reviews (
 booking_id uuid not null references public.pilot_bookings(id),
 author_id uuid not null default auth.uid() references auth.users(id),
 rating integer not null check (rating between 1 and 5),
 body text not null check (length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 primary key (booking_id,author_id)
);
alter table public.booking_reviews enable row level security;
revoke all on public.booking_reviews from anon, authenticated;
grant select, insert on public.booking_reviews to authenticated;
create policy "Participants read reviews" on public.booking_reviews for select to authenticated
 using (public.booking_participant(booking_id));
create policy "Completed participants review" on public.booking_reviews for insert to authenticated
 with check (author_id=auth.uid() and public.booking_participant(booking_id)
 and exists (select 1 from public.pilot_bookings b where b.id=booking_id and b.status='completed'));

create table public.booking_notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references auth.users(id),
 booking_id uuid not null references public.pilot_bookings(id),
 body text not null,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index booking_notifications_recipient on public.booking_notifications(recipient_id,created_at desc);
alter table public.booking_notifications enable row level security;
revoke all on public.booking_notifications from anon, authenticated;
grant select on public.booking_notifications to authenticated;
grant update(read_at) on public.booking_notifications to authenticated;
create policy "Read own notifications" on public.booking_notifications for select to authenticated
 using (recipient_id=auth.uid() and public.account_is_active());
create policy "Mark own notifications" on public.booking_notifications for update to authenticated
 using (recipient_id=auth.uid() and public.account_is_active())
 with check (recipient_id=auth.uid() and public.account_is_active());

create function public.notify_booking_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid; title text; notice text;
begin
 select s.owner_id,s.title into owner,title from public.pilot_spots s where s.id=new.spot_id;
 if TG_OP='UPDATE' and old.status=new.status then return new; end if;
 notice := case new.status
 when 'pending' then 'Новий запит на бронювання'
 when 'confirmed' then 'Бронювання підтверджено'
 when 'declined' then 'Запит відхилено'
 when 'cancelled' then 'Бронювання скасовано'
 when 'completed' then 'Співпрацю завершено — залиште відгук' end;
 insert into public.booking_notifications(recipient_id,booking_id,body)
 select recipient,new.id,notice || ' · ' || title from unnest(array[owner,new.guest_id]) recipient;
 return new;
end;
$$;
revoke all on function public.notify_booking_event() from public, anon, authenticated;
create trigger notify_booking_event after insert or update of status on public.pilot_bookings
 for each row execute function public.notify_booking_event();

create function public.notify_booking_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.booking_notifications(recipient_id,booking_id,body)
 select case when new.author_id=b.guest_id then s.owner_id else b.guest_id end,
 b.id,'Нове повідомлення · ' || s.title
 from public.pilot_bookings b join public.pilot_spots s on s.id=b.spot_id where b.id=new.booking_id;
 return new;
end;
$$;
revoke all on function public.notify_booking_message() from public, anon, authenticated;
create trigger notify_booking_message after insert on public.booking_messages
 for each row execute function public.notify_booking_message();

create function public.complete_pilot_booking(booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.booking_participant(booking) then raise exception 'Forbidden' using errcode='42501'; end if;
 update public.pilot_bookings set status='completed'
 where id=booking and status='confirmed' and upper(slot) <= (now() at time zone 'Europe/Kyiv');
 if not found then
  if exists (select 1 from public.pilot_bookings where id=booking and status='completed') then return; end if;
  raise exception 'Booking has not finished' using errcode='22023';
 end if;
end;
$$;
revoke all on function public.complete_pilot_booking(uuid) from public, anon;
grant execute on function public.complete_pilot_booking(uuid) to authenticated;
commit;

begin;
-- Етап 4а: Realtime-чати, непрочитані, антиспам, push-підписки, нагадування про бронювання.
create extension if not exists pg_cron;

-- Realtime поважає RLS: події отримують лише учасники бронювання / отримувач сповіщення.
alter publication supabase_realtime add table public.booking_messages, public.booking_notifications;

-- ---- Прочитання чатів ----
create table public.booking_reads (
 booking_id uuid not null references public.pilot_bookings(id),
 user_id uuid not null references auth.users(id),
 last_read_at timestamptz not null default now(),
 primary key (booking_id, user_id)
);
alter table public.booking_reads enable row level security;
revoke all on public.booking_reads from anon, authenticated;
grant select on public.booking_reads to authenticated;
create policy "Read own chat reads" on public.booking_reads for select to authenticated using (user_id = auth.uid());

create function public.mark_booking_read(booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.booking_participant(booking) then raise exception 'Forbidden' using errcode = '42501'; end if;
 insert into public.booking_reads(booking_id, user_id, last_read_at) values (booking, auth.uid(), now())
 on conflict (booking_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;
revoke all on function public.mark_booking_read(uuid) from public, anon;
grant execute on function public.mark_booking_read(uuid) to authenticated;

-- Чати поточного користувача з часом останнього повідомлення й кількістю непрочитаних.
create function public.list_my_chats()
returns table (id uuid, spot_id uuid, guest_id uuid, owner_id uuid, slot tsrange, status text, counterpart_name text,
  last_message_at timestamptz, last_message_mine boolean, unread_count integer)
language sql stable security definer set search_path = '' as $$
 select b.id, b.spot_id, b.guest_id, s.owner_id, b.slot, b.status::text, p.name,
  m.created_at, m.author_id = auth.uid(),
  (select count(*)::integer from public.booking_messages x
    where x.booking_id = b.id and x.author_id <> auth.uid()
      and x.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz))
 from public.pilot_bookings b
 join public.pilot_spots s on s.id = b.spot_id
 left join public.profiles p on p.id = case when b.guest_id = auth.uid() then s.owner_id else b.guest_id end
 left join lateral (select x.created_at, x.author_id from public.booking_messages x
   where x.booking_id = b.id order by x.created_at desc limit 1) m on true
 left join public.booking_reads r on r.booking_id = b.id and r.user_id = auth.uid()
 where public.account_is_active() and auth.uid() in (b.guest_id, s.owner_id)
 order by coalesce(m.created_at, b.created_at) desc;
$$;
revoke all on function public.list_my_chats() from public, anon;
grant execute on function public.list_my_chats() to authenticated;

-- ---- Антиспам: 10 повідомлень за хвилину, 300 за добу ----
create index booking_messages_author_time on public.booking_messages(author_id, created_at);
create function public.limit_booking_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 -- Серіалізуємо вставки одного автора, інакше паралельні запити обійшли б ліміт.
 perform pg_advisory_xact_lock(hashtext('booking_messages:' || new.author_id::text));
 if (select count(*) from public.booking_messages
     where author_id = new.author_id and created_at > now() - interval '1 minute') >= 10
  or (select count(*) from public.booking_messages
     where author_id = new.author_id and created_at > now() - interval '1 day') >= 300 then
  raise exception 'Too many messages' using errcode = 'WW429';
 end if;
 return new;
end;
$$;
revoke all on function public.limit_booking_messages() from public, anon, authenticated;
create trigger limit_booking_messages before insert on public.booking_messages
 for each row execute function public.limit_booking_messages();

-- ---- Push-підписки ----
-- Кожне сповіщення пушиться не більше одного разу (send-push «бере» рядок, ставлячи pushed_at).
alter table public.booking_notifications add column pushed_at timestamptz;
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
 p256dh text not null check (length(p256dh) between 1 and 200),
 auth text not null check (length(auth) between 1 and 100),
 created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
create policy "Read own push subscriptions" on public.push_subscriptions for select to authenticated
 using (user_id = auth.uid());

-- Той самий пристрій (endpoint) завжди належить останньому, хто ввімкнув на ньому push:
-- на спільному ноутбуці попередній акаунт більше не отримує сповіщень.
create function public.save_push_subscription(sub_endpoint text, sub_p256dh text, sub_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 if (select count(*) from public.push_subscriptions where user_id = auth.uid() and endpoint <> sub_endpoint) >= 10 then
  raise exception 'Too many devices' using errcode = '22023';
 end if;
 delete from public.push_subscriptions where endpoint = sub_endpoint;
 insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values (auth.uid(), sub_endpoint, sub_p256dh, sub_auth);
end;
$$;
revoke all on function public.save_push_subscription(text,text,text) from public, anon;
grant execute on function public.save_push_subscription(text,text,text) to authenticated;

create function public.delete_push_subscription(sub_endpoint text) returns void
language sql security definer set search_path = '' as $$
 delete from public.push_subscriptions where endpoint = sub_endpoint and user_id = auth.uid();
$$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---- Нагадування за ~1 год до підтвердженого бронювання (один раз) ----
alter table public.pilot_bookings add column reminded_at timestamptz;
create function public.send_booking_reminders() returns integer
language sql security definer set search_path = '' as $$
 with due as (
  update public.pilot_bookings b set reminded_at = now()
  where b.status = 'confirmed' and b.reminded_at is null
   and lower(b.slot) between (now() at time zone 'Europe/Kyiv') + interval '50 minutes'
                         and (now() at time zone 'Europe/Kyiv') + interval '70 minutes'
  returning b.id, b.spot_id, b.guest_id, lower(b.slot) as starts
 ), sent as (
  insert into public.booking_notifications(recipient_id, booking_id, body)
  select recipient, d.id, 'Нагадування: зарядка о ' || to_char(d.starts, 'HH24:MI') || ' · ' || s.title
  from due d join public.pilot_spots s on s.id = d.spot_id
  cross join lateral unnest(array[s.owner_id, d.guest_id]) recipient
  returning 1
 )
 select count(*)::integer from sent;
$$;
revoke all on function public.send_booking_reminders() from public, anon, authenticated;
select cron.schedule('wattway-booking-reminders', '*/10 * * * *', 'select public.send_booking_reminders()');
commit;

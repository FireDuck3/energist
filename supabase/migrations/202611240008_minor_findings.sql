begin;
-- Дрібні знахідки ревю безпеки 2026-11-24 (6–8).

-- ---- 6. Відгуки й зайнятість — лише для точок, які видно на карті ----
-- Раніше функції перевіряли тільки архівацію: відгуки й календар прихованої модератором точки,
-- точки заблокованого господаря чи точки на паузі лишались доступні анонімам.
-- Тепер умова та сама, що в політиці читання pilot_spots (202611240001_admin.sql).
create or replace function public.list_public_spot_reviews()
returns table (spot_id uuid, author_name text, rating integer, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select b.spot_id, coalesce(nullif(btrim(p.name), ''), 'Учасник WattWay'), r.rating, r.body, r.created_at
 from public.booking_reviews r
 join public.pilot_bookings b on b.id=r.booking_id and b.guest_id=r.author_id
 join public.pilot_spots s on s.id=b.spot_id
 left join public.profiles p on p.id=r.author_id
 where b.status='completed'
  and (s.owner_id = auth.uid()
   or (s.archived_at is null and s.hidden_at is null and not s.owner_blocked
    and (not s.paused or public.has_active_pilot_booking(s.id))))
 order by r.created_at desc;
$$;
revoke all on function public.list_public_spot_reviews() from public;
grant execute on function public.list_public_spot_reviews() to anon, authenticated;

create or replace function public.pilot_spot_availability(point_id uuid, from_day date, to_day date)
returns table (starts timestamp, ends timestamp)
language plpgsql stable security definer set search_path = '' as $$
begin
 if from_day is null or to_day is null or to_day < from_day or to_day - from_day > 31 then
  raise exception 'Invalid range' using errcode = '22023';
 end if;
 return query
  select lower(b.slot), upper(b.slot) from public.pilot_bookings b
  join public.pilot_spots s on s.id = b.spot_id
  where b.spot_id = point_id and b.status in ('pending','confirmed')
   and (s.owner_id = auth.uid()
    or (s.archived_at is null and s.hidden_at is null and not s.owner_blocked
     and (not s.paused or public.has_active_pilot_booking(s.id))))
   and b.slot && tsrange(from_day::timestamp, (to_day + 1)::timestamp, '[)')
  order by 1;
end;
$$;
revoke all on function public.pilot_spot_availability(uuid,date,date) from public;
grant execute on function public.pilot_spot_availability(uuid,date,date) to anon, authenticated;

-- ---- 7. Чат закривається, коли бронювання скінчилось ----
-- Раніше писати можна було в будь-якому бронюванні назавжди, навіть у відхиленому — канал для
-- переслідування. Тепер: поки запит чекає чи підтверджений; після завершення — ще 14 днів після кінця
-- слоту (домовитися про оплату й залишити відгук); у відхиленому й скасованому — ні.
-- Те саме правило — chatClosed у js/chat-view-model.js (CHAT_OPEN_DAYS_AFTER = 14).
create function public.booking_chat_open(booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.pilot_bookings b where b.id = booking and (
  b.status in ('pending', 'confirmed')
  or (b.status = 'completed' and upper(b.slot) + interval '14 days' > (now() at time zone 'Europe/Kyiv'))));
$$;
revoke all on function public.booking_chat_open(uuid) from public, anon;
grant execute on function public.booking_chat_open(uuid) to authenticated;

drop policy "Participants send messages" on public.booking_messages;
create policy "Participants send messages" on public.booking_messages for insert to authenticated
 with check (author_id = auth.uid() and public.booking_participant(booking_id) and public.booking_chat_open(booking_id));

-- ---- 8. Сповіщення не приходить тому, хто сам зробив дію ----
-- Раніше обидві сторони отримували кожну подію: гість — «Новий запит на бронювання» про власний запит,
-- господар — «Бронювання підтверджено» після власного підтвердження (і push теж).
-- Тепер отримує лише інша сторона; якщо діяв не учасник (адміністратор, cron) — обидві.
create or replace function public.notify_booking_event() returns trigger
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
 select recipient,new.id,notice || ' · ' || title from unnest(array[owner,new.guest_id]) recipient
 where recipient is distinct from auth.uid();
 return new;
end;
$$;
revoke all on function public.notify_booking_event() from public, anon, authenticated;
commit;

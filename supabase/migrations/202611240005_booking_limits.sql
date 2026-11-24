begin;
-- Ліміти запитів на бронювання (ревю безпеки 2026-11-24, знахідка 2).
-- Запит у статусі pending займає слот (exclude-обмеження pilot_bookings), а лімітів не було:
-- бот із безкоштовним акаунтом міг зайняти запитами весь календар усіх точок на 29 днів уперед.
--
-- 1) Одночасно не більше 3 запитів, що чекають відповіді господаря (pending, ще не закінчились).
--    Підтверджені господарем бронювання не рахуються — їх схвалила людина.
-- 2) Не більше 10 запитів за 24 години (разом зі скасованими й відхиленими) — щоб не крутити
--    «запит → скасування → запит».
-- Помилки: WW429 з повідомленням pending_limit / daily_limit (сайт показує їх текстом, js/booking-errors.js).
-- Числа мають збігатися з BOOKING_LIMITS у js/booking-errors.js.
--
-- Тіло функції — з 202611180002_host_calendar.sql, додано лише блок лімітів.

create or replace function public.request_pilot_booking(point_id uuid, requested_day date, starts time, hours integer, requested_device text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare point public.pilot_spots; begins timestamp; finishes timestamp; kyiv_now timestamp; booking_id uuid;
 me uuid := auth.uid();
begin
 if me is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 select * into point from public.pilot_spots where id = point_id;
 if not found or point.owner_id = me or point.paused or point.archived_at is not null then
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

 -- ---- Ліміти ----
 -- Серіалізуємо запити одного гостя, інакше паралельні виклики обійшли б ліміт.
 perform pg_advisory_xact_lock(hashtext('pilot_bookings:' || me::text));
 if (select count(*) from public.pilot_bookings b
     where b.guest_id = me and b.status = 'pending' and upper(b.slot) > kyiv_now) >= 3 then
  raise exception 'pending_limit' using errcode = 'WW429';
 end if;
 if (select count(*) from public.pilot_bookings b
     where b.guest_id = me and b.created_at > now() - interval '24 hours') >= 10 then
  raise exception 'daily_limit' using errcode = 'WW429';
 end if;

 insert into public.pilot_bookings(spot_id,guest_id,device,slot)
 values(point_id,me,requested_device,tsrange(begins,finishes,'[)')) returning id into booking_id;
 return booking_id;
end;
$$;
revoke all on function public.request_pilot_booking(uuid,date,time,integer,text) from public, anon;
grant execute on function public.request_pilot_booking(uuid,date,time,integer,text) to authenticated;

-- Лічильники лімітів шукають бронювання гостя за часом створення.
create index if not exists pilot_bookings_guest_created on public.pilot_bookings (guest_id, created_at);
commit;

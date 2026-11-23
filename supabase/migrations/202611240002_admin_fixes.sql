begin;
-- Виправлення адмінпанелі після ревю (до 202611240001_admin.sql):
-- 1) господар прихованої точки може попросити модератора перевірити її знову;
-- 2) «Сховати точку» / «Заблокувати» за скаргою — одна атомарна дія разом із закриттям скарги;
-- 3) блокування забороняє й вхід через Supabase Auth (banned_until), а не лише статус у users;
-- 4) журнал дій не заважає видалити акаунт колишнього адміністратора й зберігає його ім'я.
--
-- Порядок розгортання: спершу ця міграція, потім сайт (сайт читає колонку review_requested_at).

-- ---- 1. Запит господаря на повторну перевірку ----
alter table public.pilot_spots add column review_requested_at timestamptz;
-- Бачить лише господар: прихований рядок іншим не віддає політика читання.
grant select (review_requested_at) on public.pilot_spots to anon, authenticated;

create function public.request_spot_review(point_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare point public.pilot_spots;
begin
 point := public.require_own_pilot_spot(point_id);
 if point.hidden_at is null then raise exception 'not_hidden' using errcode = '22023'; end if;
 update public.pilot_spots set review_requested_at = coalesce(review_requested_at, now()) where id = point_id;
end;
$$;
revoke all on function public.request_spot_review(uuid) from public, anon;
grant execute on function public.request_spot_review(uuid) to authenticated;

-- Рішення модератора (сховати ще раз чи повернути) закриває запит.
create or replace function public.admin_set_spot_hidden(point_id uuid, hide boolean, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(coalesce(reason, ''));
begin
 perform public.require_admin();
 if hide is null or (hide and char_length(clean) not between 3 and 500) then
  raise exception 'bad_reason' using errcode = '22023';
 end if;
 update public.pilot_spots
 set hidden_at = case when hide then coalesce(hidden_at, now()) end, hidden_reason = case when hide then clean end,
  review_requested_at = null
 where id = point_id;
 if not found then raise exception 'bad_target' using errcode = '22023'; end if;
 if hide then
  update public.pilot_bookings set status = 'cancelled'
  where spot_id = point_id and status in ('pending', 'confirmed') and upper(slot) > (now() at time zone 'Europe/Kyiv');
 end if;
 perform public.admin_log(case when hide then 'spot_hide' else 'spot_show' end, 'spot', point_id::text, clean);
end;
$$;

drop function public.admin_list_spots();
create function public.admin_list_spots()
returns table (id uuid, title text, district text, lat numeric, lng numeric, owner_id uuid, owner_name text,
 owner_email text, owner_status text, owner_verified boolean, verified_at timestamptz, hidden_at timestamptz,
 hidden_reason text, review_requested_at timestamptz, archived_at timestamptz, paused boolean, open_reports bigint,
 completed_bookings bigint, active_bookings bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
 perform public.require_admin();
 return query
 select s.id, s.title, s.district, s.lat, s.lng, s.owner_id, btrim(u.first_name || ' ' || u.last_name), u.email,
  u.status, u.verified_at is not null, s.verified_at, s.hidden_at, s.hidden_reason, s.review_requested_at, s.archived_at, s.paused,
  (select count(*) from public.reports r where r.target_type = 'spot' and r.target_id = s.id::text and r.status = 'open'),
  (select count(*) from public.pilot_bookings b where b.spot_id = s.id and b.status = 'completed'),
  (select count(*) from public.pilot_bookings b where b.spot_id = s.id and b.status in ('pending', 'confirmed'))
 from public.pilot_spots s
 left join public.users u on u.id = s.owner_id
 order by (s.archived_at is not null), (s.review_requested_at is null), s.title;
end;
$$;
revoke all on function public.admin_list_spots() from public, anon;
grant execute on function public.admin_list_spots() to authenticated;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare kyiv_now timestamp := now() at time zone 'Europe/Kyiv';
begin
 perform public.require_admin();
 return jsonb_build_object(
  'users', (select count(*) from public.users),
  'blocked_users', (select count(*) from public.users where status <> 'active'),
  'hosts', (select count(distinct owner_id) from public.pilot_spots where archived_at is null),
  'verified_hosts', (select count(*) from public.users where verified_at is not null),
  'spots', (select count(*) from public.pilot_spots where archived_at is null),
  'hidden_spots', (select count(*) from public.pilot_spots where archived_at is null and hidden_at is not null),
  'review_requests', (select count(*) from public.pilot_spots where archived_at is null and hidden_at is not null and review_requested_at is not null),
  'unverified_spots', (select count(*) from public.pilot_spots where archived_at is null and hidden_at is null and verified_at is null),
  'open_reports', (select count(*) from public.reports where status = 'open'),
  'bookings_30d', (select count(*) from public.pilot_bookings where created_at > now() - interval '30 days'),
  'completed_30d', (select count(*) from public.pilot_bookings where status = 'completed' and created_at > now() - interval '30 days'),
  'problem_bookings', (select count(*) from public.pilot_bookings b where b.created_at > now() - interval '60 days' and (
    exists (select 1 from public.reports r where r.booking_id = b.id and r.status = 'open')
    or (b.status = 'pending' and (lower(b.slot) <= kyiv_now or b.created_at < now() - interval '24 hours'))
    or (b.status = 'confirmed' and upper(b.slot) < kyiv_now - interval '24 hours'))),
  'sync_errors_7d', (select count(*) from public.station_sync_runs where error is not null and started_at > now() - interval '7 days'),
  'last_sync', (select to_jsonb(r) from (select started_at, finished_at, source, fetched, inserted, updated, skipped, error
    from public.station_sync_runs order by started_at desc limit 1) r)
 );
end;
$$;

-- ---- 2. Дія за скаргою й закриття скарги — в одній транзакції ----
create function public.admin_act_on_report(report_id uuid, act text, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare rep public.reports; clean text := btrim(coalesce(note, '')); done text;
begin
 perform public.require_admin();
 select * into rep from public.reports where id = report_id for update;
 if not found or rep.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;
 if act = 'hide_spot' and rep.target_type = 'spot' then
  perform public.admin_set_spot_hidden(rep.target_id::uuid, true, clean);
  done := 'Точку приховано: ';
 elsif act = 'block_user' and rep.target_type = 'user' then
  perform public.admin_set_user_status(rep.target_id::uuid, 'suspended', clean);
  done := 'Користувача заблоковано: ';
 else
  raise exception 'bad_input' using errcode = '22023';
 end if;
 update public.reports set status = 'resolved', resolved_at = now(), resolution = left(done || clean, 500) where id = report_id;
 perform public.admin_log('report_resolved', 'report', report_id::text, done || clean);
end;
$$;
revoke all on function public.admin_act_on_report(uuid, text, text) from public, anon;
grant execute on function public.admin_act_on_report(uuid, text, text) to authenticated;

-- ---- 3. Блокування забороняє й вхід (Supabase Auth перевіряє banned_until при вході й оновленні токена) ----
create or replace function public.admin_set_user_status(target uuid, new_status text, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_admin(); clean text := btrim(coalesce(note, ''));
begin
 if new_status not in ('active', 'suspended') or char_length(clean) > 500 then
  raise exception 'bad_input' using errcode = '22023';
 end if;
 if target = me then raise exception 'self' using errcode = '22023'; end if;
 if new_status = 'suspended' then
  if exists (select 1 from public.admins a where a.user_id = target) then
   raise exception 'admin_target' using errcode = '22023';
  end if;
  if char_length(clean) < 3 then raise exception 'bad_reason' using errcode = '22023'; end if;
 end if;
 update public.users set status = new_status where id = target;
 if not found then raise exception 'bad_target' using errcode = '22023'; end if;
 -- 100 років, як «назавжди» в Auth API: значення 'infinity' Auth не прочитає.
 update auth.users set banned_until = case when new_status = 'suspended' then now() + interval '100 years' end
 where id = target;
 if new_status = 'suspended' then
  update public.pilot_bookings b set status = 'cancelled'
  where b.status in ('pending', 'confirmed') and upper(b.slot) > (now() at time zone 'Europe/Kyiv')
   and (b.guest_id = target or exists (select 1 from public.pilot_spots s where s.id = b.spot_id and s.owner_id = target));
 end if;
 perform public.admin_log(case when new_status = 'suspended' then 'user_block' else 'user_unblock' end, 'user', target::text, clean);
end;
$$;
-- Ті, кого заблокували до цієї міграції, теж не мають входити.
update auth.users au set banned_until = now() + interval '100 years'
where exists (select 1 from public.users u where u.id = au.id and u.status <> 'active')
 and (au.banned_until is null or au.banned_until < now());

-- ---- 4. Журнал: ім'я адміністратора зберігається в записі, акаунт можна видалити ----
alter table public.admin_actions add column admin_name text not null default '';
update public.admin_actions a set admin_name = btrim(u.first_name || ' ' || u.last_name) || ' · ' || u.email
from public.users u where u.id = a.admin_id;
alter table public.admin_actions alter column admin_id drop not null;
alter table public.admin_actions drop constraint admin_actions_admin_id_fkey;
alter table public.admin_actions add constraint admin_actions_admin_id_fkey
 foreign key (admin_id) references auth.users(id) on delete set null;

create or replace function public.admin_log(act text, kind text, target text, note text) returns void
language sql security definer set search_path = '' as $$
 insert into public.admin_actions(admin_id, admin_name, action, target_type, target_id, note)
 values (auth.uid(),
  coalesce((select btrim(u.first_name || ' ' || u.last_name) || ' · ' || u.email from public.users u where u.id = auth.uid()), ''),
  act, kind, target, left(btrim(coalesce(note, '')), 500));
$$;

create or replace function public.admin_list_actions()
returns table (id bigint, created_at timestamptz, admin_name text, action text, target_type text, target_id text, note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
 perform public.require_admin();
 return query
 select a.id, a.created_at, coalesce(nullif(btrim(u.first_name || ' ' || u.last_name), ''), nullif(a.admin_name, ''), 'Видалений акаунт'),
  a.action, a.target_type, a.target_id, a.note
 from public.admin_actions a left join public.users u on u.id = a.admin_id
 order by a.created_at desc limit 100;
end;
$$;
commit;

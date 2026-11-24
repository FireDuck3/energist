begin;
-- Push-підписки: лише адреси справжніх push-сервісів браузерів (ревю безпеки 2026-11-24, знахідка 5).
-- Раніше save_push_subscription приймала будь-яку https-адресу. Функція send-push надсилає POST на кожну
-- збережену адресу отримувача, тож зловмисник міг зберегти свою адресу й змусити сервер слати запити
-- куди завгодно (сліпий SSRF) — щоразу, коли йому приходить сповіщення.
--
-- Дозволені хости (той самий список — isPushEndpoint у supabase/functions/send-push/payload.js):
-- fcm.googleapis.com (Chrome, Edge, Opera, Samsung), updates.push.services.mozilla.com (Firefox),
-- web.push.apple.com (Safari), *.notify.windows.com (Edge Legacy). Одразу після хоста — «/»:
-- так відсікаються порт, логін у адресі й хости на кшталт fcm.googleapis.com.evil.example.

alter table public.push_subscriptions add constraint push_subscriptions_known_service check (
 endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
);

-- Тіло — з 202611180003_chats_push.sql, додано перевірку адреси (зрозуміла помилка 22023 замість 23514).
create or replace function public.save_push_subscription(sub_endpoint text, sub_p256dh text, sub_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.account_is_active() then
  raise exception 'Sign-in required' using errcode = '42501';
 end if;
 if sub_endpoint is null or length(sub_endpoint) > 1000 or sub_endpoint !~
   '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
  raise exception 'unsupported_push_service' using errcode = '22023';
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
commit;

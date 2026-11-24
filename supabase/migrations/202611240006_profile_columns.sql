begin;
-- Профіль: клієнт змінює напряму лише ім'я, роль і телефон (ревю безпеки 2026-11-24, знахідка 3).
-- Supabase за замовчуванням дає authenticated право insert/update на всі колонки, а політика
-- «own profile: update» не обмежує колонки. Тож avatar_path і contact_channels можна було записати
-- прямим update в обхід перевірок set_my_host_contact і set_my_contact_channels — наприклад,
-- поставити собі фото іншої людини (<чужий uid>/avatar/...) або шлях з «..».
--
-- 1) Прямий запис — лише колонки, які сайт пише сам: upsert {id, name, role} (js/supabase.js → saveProfile)
--    і update {phone} (savePhone). Фото й канали зв'язку — тільки через серверні функції.
-- 2) Захист у глибину: фото профілю — лише з власної теки <uid>/avatar/ у бакеті spot-photos, без «..».
-- Сайт змінювати не треба: він уже пише лише ці колонки.

revoke insert, update, delete on public.profiles from anon, authenticated;
-- upsert робить ON CONFLICT DO UPDATE SET id = …, name = …, role = …, тож update(id) теж потрібен;
-- змінити id на чужий не дасть політика «own profile: update» (with check auth.uid() = id).
grant insert (id, name, role) on public.profiles to authenticated;
grant update (id, name, role, phone) on public.profiles to authenticated;

alter table public.profiles add constraint profiles_avatar_own_folder check (
 avatar_path is null
 or (left(avatar_path, length(id::text) + 8) = id::text || '/avatar/' and avatar_path not like '%..%'));
commit;

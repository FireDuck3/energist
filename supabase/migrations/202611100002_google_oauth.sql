-- Apply after 202611100001_users.sql; safe for an already migrated database.
begin;
create or replace function public.sync_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first_value text; last_value text;
begin
  if TG_OP = 'INSERT' then
    if NEW.raw_app_meta_data->>'provider' = 'google' then
      -- Provider metadata is optional: mononymous Google users have no surname.
      first_value := left(btrim(regexp_replace(coalesce(
        nullif(NEW.raw_user_meta_data->>'given_name', ''),
        nullif(NEW.raw_user_meta_data->>'full_name', ''),
        nullif(NEW.raw_user_meta_data->>'name', ''), 'Користувач'), '[[:cntrl:]]', '', 'g')), 60);
      if first_value = '' then first_value := 'Користувач'; end if;
      last_value := left(btrim(regexp_replace(coalesce(NEW.raw_user_meta_data->>'family_name', ''), '[[:cntrl:]]', '', 'g')), 60);
    else
      first_value := btrim(coalesce(NEW.raw_user_meta_data->>'first_name', ''));
      last_value := btrim(coalesce(NEW.raw_user_meta_data->>'last_name', ''));
      -- Older clients collect names after signup.
      if first_value = '' and last_value = '' then
        first_value := 'Користувач';
      elsif char_length(first_value) not between 1 and 60 or char_length(last_value) not between 1 and 60
         or first_value ~ '[[:cntrl:]]' or last_value ~ '[[:cntrl:]]' then
        raise exception 'First and last names must contain 1 to 60 characters' using errcode = '23514';
      end if;
    end if;
    insert into public.users(id, first_name, last_name, email, registered_at)
      values(NEW.id, first_value, last_value, lower(btrim(NEW.email)), NEW.created_at);
  else
    update public.users set email = lower(btrim(NEW.email)) where id = NEW.id;
  end if;
  return NEW;
end;
$$;
revoke all on function public.sync_auth_user() from public;
commit;

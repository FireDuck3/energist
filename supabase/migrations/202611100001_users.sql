-- Apply AFTER schema.sql. Password hashes belong exclusively to auth.users.encrypted_password.
-- Never copy them into a public API table. This migration is transactional.
begin;
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  registered_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'suspended', 'disabled'))
);
create unique index users_email_unique on public.users (lower(email));
alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
create policy "read own account" on public.users for select to authenticated using (id = auth.uid());

-- SECURITY DEFINER reads account state without a recursive users policy.
create function public.account_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users where id = auth.uid() and status = 'active');
$$;
revoke all on function public.account_is_active() from public;
grant execute on function public.account_is_active() to authenticated;

create function public.sync_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first_value text; last_value text;
begin
  if TG_OP = 'INSERT' then
    first_value := btrim(coalesce(NEW.raw_user_meta_data->>'first_name', ''));
    last_value := btrim(coalesce(NEW.raw_user_meta_data->>'last_name', ''));
    -- Older clients collect names after signup.
    if first_value = '' and last_value = '' then
      first_value := 'Користувач';
    elsif char_length(first_value) not between 1 and 60 or char_length(last_value) not between 1 and 60
       or first_value ~ '[[:cntrl:]]' or last_value ~ '[[:cntrl:]]' then
      raise exception 'First and last names must contain 1 to 60 characters' using errcode = '23514';
    end if;
    insert into public.users(id, first_name, last_name, email, registered_at)
      values(NEW.id, first_value, last_value, lower(btrim(NEW.email)), NEW.created_at);
  else
    -- Only Auth may change the email. Metadata can never change account status.
    update public.users set email = lower(btrim(NEW.email)) where id = NEW.id;
  end if;
  return NEW;
end;
$$;
revoke all on function public.sync_auth_user() from public;
create trigger sync_registered_user after insert or update of email on auth.users
  for each row execute function public.sync_auth_user();

-- Existing accounts retain their names; missing surnames remain empty until an admin migrates them.
insert into public.users(id, first_name, last_name, email, registered_at)
select u.id, left(coalesce(nullif(btrim(u.raw_user_meta_data->>'first_name'), ''), nullif(p.name, ''), 'Користувач'),60),
  left(coalesce(u.raw_user_meta_data->>'last_name',''),60), lower(btrim(u.email)), u.created_at
from auth.users u left join public.profiles p on p.id = u.id where u.email is not null;

-- Restrictive policies combine with existing ownership policies using AND.
create policy "active accounts only" on public.profiles as restrictive for all to authenticated
  using (public.account_is_active()) with check (public.account_is_active());
create policy "active accounts only" on public.search_history as restrictive for all to authenticated
  using (public.account_is_active()) with check (public.account_is_active());
create policy "active accounts only" on public.charge_history as restrictive for all to authenticated
  using (public.account_is_active()) with check (public.account_is_active());
commit;

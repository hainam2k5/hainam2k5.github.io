-- =============================================================================
-- Advisor self-registration via a secret code.
-- Run this in the Supabase SQL Editor if your database was created BEFORE this
-- feature (a fresh schema.sql already includes it). Safe to run multiple times.
--
-- How it works: the "Đăng ký → Cố vấn" form sends role='advisor' + advisor_code
-- in the signup metadata. The trigger below promotes the new account to
-- 'advisor' ONLY when advisor_code matches the value stored in app_secrets.
-- The app (anon/authenticated) can never read app_secrets — RLS is on with no
-- policies, so only this SECURITY DEFINER function can see the code.
-- =============================================================================

-- 1) Secret store -------------------------------------------------------------
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null default ''
);
alter table public.app_secrets enable row level security;
-- No policies on purpose → no client can select/insert/update/delete here.

-- 2) Set YOUR advisor code ----------------------------------------------------
-- Change 'DOI-MA-NAY' to a strong secret and give it only to real advisors.
insert into public.app_secrets (key, value) values ('advisor_signup_code', 'DOI-MA-NAY')
  on conflict (key) do update set value = excluded.value;

-- 3) Upgrade the signup trigger ----------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existing    uuid;
  want_role   text := coalesce(new.raw_user_meta_data->>'role', 'student');
  code_in     text := coalesce(new.raw_user_meta_data->>'advisor_code', '');
  final_role  text := 'student';
begin
  select id into existing
    from public.profiles
   where lower(email) = lower(new.email) and user_id is null
   limit 1;

  if existing is not null then
    update public.profiles set user_id = new.id where id = existing;
    return new;
  end if;

  if want_role = 'advisor'
     and code_in <> ''
     and exists (select 1 from public.app_secrets
                  where key = 'advisor_signup_code' and value = code_in) then
    final_role := 'advisor';
  end if;

  insert into public.profiles (user_id, role, full_name, email, student_code, program, cohort)
  values (
    new.id,
    final_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data->>'student_code', ''),
    coalesce(new.raw_user_meta_data->>'program', ''),
    coalesce(new.raw_user_meta_data->>'cohort', '')
  );
  return new;
end; $$;

-- Trigger itself is unchanged (already created by schema.sql); re-assert anyway.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

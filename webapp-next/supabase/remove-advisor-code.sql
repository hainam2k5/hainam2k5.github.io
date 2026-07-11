-- =============================================================================
-- SECURITY CLEANUP — remove the obsolete "advisor sign-up code" mechanism.
--
-- Why: public self-registration was removed from the app, but the old database
-- trigger still promoted a signup to 'advisor' when metadata carried the right
-- advisor_code. The placeholder code ('DOI-MA-NAY') is visible in the public
-- GitHub repo, so anyone calling the Supabase signup API directly could become
-- an advisor if the code was never changed. This migration closes that path.
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- 1) Trigger: every fresh signup is a STUDENT, no exceptions. (Linking a
--    pre-provisioned profile row by email still works — that is the only way
--    advisor/manager accounts get activated.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  select id into existing
    from public.profiles
   where lower(email) = lower(new.email) and user_id is null
   limit 1;

  if existing is not null then
    update public.profiles set user_id = new.id where id = existing;
    return new;
  end if;

  insert into public.profiles (user_id, role, full_name, email, student_code, program, cohort)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data->>'student_code', ''),
    coalesce(new.raw_user_meta_data->>'program', ''),
    coalesce(new.raw_user_meta_data->>'cohort', '')
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Drop the now-unused secret store (held only the advisor signup code).
drop table if exists public.app_secrets;

-- 3) RECOMMENDED (dashboard, not SQL): Authentication → Sign In / Providers →
--    turn OFF "Allow new users to sign up". Accounts are created only via the
--    admin endpoint (service_role bypasses this setting), so nothing breaks —
--    and the public signup API is closed completely.

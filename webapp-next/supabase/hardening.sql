-- =============================================================================
-- Security hardening migration.
-- Run this in the Supabase SQL Editor if you already ran schema.sql before the
-- fixes. (schema.sql already contains these — a fresh install does not need it.)
--
-- Fix #1: public self-signups are forced to role = 'student'. Advisors/managers
--         must be pre-provisioned as a profile row (user_id null) to be linked.
-- Fix #2: anonymous (not-signed-in) visitors can no longer read advisor cards.
-- =============================================================================

-- Fix #1 --------------------------------------------------------------------
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
  else
    -- role is hardcoded: signup can never mint an advisor/manager account.
    insert into public.profiles (user_id, role, full_name, email, student_code, program, cohort)
    values (
      new.id, 'student',
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      new.email,
      nullif(new.raw_user_meta_data->>'student_code', ''),
      coalesce(new.raw_user_meta_data->>'program', ''),
      coalesce(new.raw_user_meta_data->>'cohort', '')
    );
  end if;
  return new;
end; $$;

-- (Optional) demote any advisor/manager accounts that were self-created before
-- this fix. Keeps the seeded demo advisor. Review before running if you have
-- real advisors you provisioned through signup.
-- update public.profiles set role = 'student'
--  where role in ('advisor','manager') and email <> 'advisor@demo.edu.vn';

-- Fix #2 --------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  user_id = auth.uid()
  or my_role() in ('advisor','manager')
  or (auth.uid() is not null and role in ('advisor','manager'))
);

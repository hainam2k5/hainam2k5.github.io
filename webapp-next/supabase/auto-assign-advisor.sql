-- =============================================================================
-- Auto-assign every student to the advisor of their MAJOR (program), so the
-- "one advisor per major" split is fully automatic and self-maintaining.
-- Run once in the Supabase SQL Editor (after schema.sql + seed.sql).
--
-- Rule: when a STUDENT row is created without an advisor, if there is an advisor
-- whose profile.program matches the student's program, assign that advisor.
-- Students added by an advisor (advisor_id already set) are left untouched.
-- Requirement: give each advisor a `program` value equal to the major they run,
--   e.g.  update public.profiles set program='Hệ thống thông tin'
--          where email='cvhttt@truong.edu.vn';
-- =============================================================================

create or replace function public.assign_advisor_by_program()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'student' and new.advisor_id is null and coalesce(new.program, '') <> '' then
    select id into new.advisor_id
      from public.profiles
     where role = 'advisor' and lower(program) = lower(new.program)
     order by created_at
     limit 1;
  end if;
  return new;
end; $$;

drop trigger if exists trg_assign_advisor on public.profiles;
create trigger trg_assign_advisor
  before insert on public.profiles
  for each row execute function public.assign_advisor_by_program();

-- One-time backfill for students that already exist without an advisor.
update public.profiles s
   set advisor_id = a.id
  from public.profiles a
 where s.role = 'student' and s.advisor_id is null
   and a.role = 'advisor' and lower(a.program) = lower(s.program);

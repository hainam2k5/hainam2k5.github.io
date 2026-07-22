-- =============================================================================
-- Teaching classes: attendance + component-grade entry per course section.
-- Adds a 'teacher' role, a `sections` table (a class a teacher teaches), an
-- `attendance` table (per session), and RLS so a section's teacher (or an
-- advisor who also teaches, or a manager) can take attendance and enter the
-- TX/GK/CK grades of the students enrolled in that class.
--
-- A class roster is the set of `courses` rows whose (code, semester,
-- academic_year) match the section — no new enrollment table needed.
-- Run once in the Supabase SQL Editor.
-- =============================================================================

-- 1) allow the 'teacher' role -------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student','advisor','manager','teacher'));

-- 2) course sections (a class taught by a teacher) ----------------------------
create table if not exists public.sections (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  name           text not null,
  semester       text not null,
  academic_year  text not null default '',
  teacher_id     uuid references public.profiles(id) on delete set null,
  credits        int  not null default 3,
  weight_regular numeric not null default 0.2,
  weight_midterm numeric not null default 0.3,
  weight_final   numeric not null default 0.5,
  created_at     timestamptz not null default now()
);
create index if not exists idx_sections_teacher on public.sections(teacher_id);

-- 3) attendance (one row per student per session) -----------------------------
create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  section_id   uuid not null references public.sections(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  present      boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (section_id, student_id, session_date)
);
create index if not exists idx_attendance_section on public.attendance(section_id, session_date);
create index if not exists idx_attendance_student on public.attendance(student_id);

-- 4) keep profiles.attendance_rate in sync (feeds the risk engine) ------------
-- SECURITY DEFINER so the trigger can update the student's profile even though
-- the teacher's own RLS can't write arbitrary profiles.
create or replace function public.recompute_attendance_rate(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tot int; pre int;
begin
  select count(*), count(*) filter (where present) into tot, pre
  from public.attendance where student_id = p_student;
  if tot > 0 then
    update public.profiles set attendance_rate = round(100.0 * pre / tot) where id = p_student;
  end if;
end; $$;

create or replace function public.trg_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_attendance_rate(coalesce(new.student_id, old.student_id));
  return coalesce(new, old);
end; $$;

drop trigger if exists attendance_recompute on public.attendance;
create trigger attendance_recompute after insert or update or delete on public.attendance
  for each row execute function public.trg_attendance();

-- 5) RLS ----------------------------------------------------------------------
alter table public.sections   enable row level security;
alter table public.attendance enable row level security;

-- helper: does the current user teach this (code, semester, academic_year)?
create or replace function public.teaches_course(p_code text, p_sem text, p_year text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sections s
    where s.teacher_id = public.my_profile_id()
      and s.code = p_code and s.semester = p_sem
      and coalesce(s.academic_year,'') = coalesce(p_year,'')
  );
$$;

-- sections: owner teacher (or manager) full access; advisors may read.
drop policy if exists sections_rw on public.sections;
create policy sections_rw on public.sections for all
  using (teacher_id = my_profile_id() or my_role() = 'manager')
  with check (teacher_id = my_profile_id() or my_role() = 'manager');
drop policy if exists sections_read on public.sections;
create policy sections_read on public.sections for select
  using (teacher_id = my_profile_id() or my_role() in ('manager','advisor'));

-- attendance: the section's teacher (or manager) manages; student reads own.
drop policy if exists attendance_rw on public.attendance;
create policy attendance_rw on public.attendance for all
  using (my_role() = 'manager' or exists (
    select 1 from public.sections s where s.id = attendance.section_id and s.teacher_id = my_profile_id()))
  with check (my_role() = 'manager' or exists (
    select 1 from public.sections s where s.id = attendance.section_id and s.teacher_id = my_profile_id()));
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select
  using (student_id = my_profile_id() or my_role() in ('manager','advisor')
         or exists (select 1 from public.sections s where s.id = attendance.section_id and s.teacher_id = my_profile_id()));

-- 6) let a section's teacher see + grade the enrolled course rows -------------
-- (additive policies — advisors/managers keep their existing access.)
drop policy if exists courses_teacher_read on public.courses;
create policy courses_teacher_read on public.courses for select
  using (public.teaches_course(code, semester, academic_year));
drop policy if exists courses_teacher_update on public.courses;
create policy courses_teacher_update on public.courses for update
  using (public.teaches_course(code, semester, academic_year))
  with check (public.teaches_course(code, semester, academic_year));

-- teacher can read the profiles of students enrolled in the classes they teach
drop policy if exists profiles_teacher_read on public.profiles;
create policy profiles_teacher_read on public.profiles for select
  using (role = 'student' and exists (
    select 1 from public.courses c
    where c.student_id = profiles.id
      and public.teaches_course(c.code, c.semester, c.academic_year)));

-- teacher may notify students in the classes they teach (e.g. grade updates from
-- the Classes page). Additive to notif_insert (advisor/manager) in rls-major-scope.
drop policy if exists notif_insert_teacher on public.notifications;
create policy notif_insert_teacher on public.notifications for insert
  with check (my_role() = 'teacher' and exists (
    select 1 from public.courses c
    where c.student_id = notifications.student_id
      and public.teaches_course(c.code, c.semester, c.academic_year)));

-- 7) realtime (optional) ------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='attendance') then
    alter publication supabase_realtime add table public.attendance;
  end if;
end $$;

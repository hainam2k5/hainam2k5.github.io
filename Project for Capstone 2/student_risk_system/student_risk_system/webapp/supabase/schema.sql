-- =============================================================================
-- Student Risk Alert System (Academic DSS) — Supabase schema
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Creates all tables, helper functions, Row Level Security (RLS) policies,
-- the auth trigger, and enables Realtime.
--
-- Security model
-- --------------
-- * A `profiles` row is the canonical record of a person (student or advisor).
--   It may or may not be linked to an auth login via `user_id`.
-- * Seed/demo students exist as profiles WITHOUT a login. When someone signs up
--   with the same email, the trigger links that auth user to the existing
--   profile (so a seeded student inherits their demo grades on first login).
-- * The public `anon` key is safe to ship in the frontend: every table below is
--   protected by RLS. NEVER put the service_role key in the frontend.
-- =============================================================================

-- Clean re-run support (safe to run multiple times) --------------------------
drop trigger if exists on_auth_user_created on auth.users;

-- ---------------------------------------------------------------- extensions
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ================================================================== TABLES ===

-- profiles: one row per person (student / advisor / manager) -----------------
create table if not exists public.profiles (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references auth.users(id) on delete set null,
  role               text not null default 'student'
                       check (role in ('student','advisor','manager')),
  full_name          text not null default '',
  email              text,
  student_code       text unique,
  program            text default '',
  cohort             text default '',
  advisor_id         uuid references public.profiles(id) on delete set null,
  attendance_rate    numeric not null default 100,   -- 0..100 (%)  risk input
  lms_activity_score numeric not null default 100,   -- 0..100      risk input
  created_at         timestamptz not null default now()
);

-- courses: one row per subject a student takes in a semester -----------------
create table if not exists public.courses (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  code           text default '',
  name           text not null,
  credits        integer not null default 3,
  semester       text not null default '',           -- e.g. '2025-1'
  academic_year  text default '',                    -- e.g. '2025-2026'
  weight_regular numeric not null default 0.2,       -- Thường xuyên (TX)
  weight_midterm numeric not null default 0.3,       -- Giữa kỳ (GK)
  weight_final   numeric not null default 0.5,       -- Cuối kỳ (CK)
  score_regular  numeric,                            -- 0..10 (nullable)
  score_midterm  numeric,
  score_final    numeric,
  total_score    numeric,                            -- 0..10 computed by app
  letter_grade   text,                               -- A / B+ / ... / F
  grade_point    numeric,                            -- 4.0 scale
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_courses_student on public.courses(student_id);

-- risk_scores: history of computed risk snapshots ---------------------------
create table if not exists public.risk_scores (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.profiles(id) on delete cascade,
  score                 numeric not null,            -- 0..100 composite
  risk_level            text not null,               -- Low|Medium|High|Critical
  factor_gpa            numeric default 0,
  factor_attendance     numeric default 0,
  factor_lms            numeric default 0,
  factor_failed_credits numeric default 0,
  computed_at           timestamptz not null default now()
);
create index if not exists idx_risk_student on public.risk_scores(student_id, computed_at desc);

-- alerts: opened when a student crosses a risk threshold --------------------
create table if not exists public.alerts (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  advisor_id     uuid references public.profiles(id) on delete set null,
  risk_level     text not null,
  score_at_alert numeric not null,
  status         text not null default 'Open'
                   check (status in ('Open','Acknowledged','Resolved','Dismissed')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists idx_alerts_status on public.alerts(status);

-- interventions: case-management records against an alert -------------------
create table if not exists public.interventions (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.alerts(id) on delete cascade,
  advisor_id  uuid references public.profiles(id) on delete set null,
  action_type text not null default 'Advising meeting',
  notes       text default '',
  status      text not null default 'Planned'
                check (status in ('Planned','Completed','Follow-up needed')),
  outcome     text default '',
  created_at  timestamptz not null default now()
);

-- notifications: advisor/system → student -----------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  sender_id  uuid references public.profiles(id) on delete set null,
  title      text not null default '',
  body       text default '',
  type       text not null default 'system'
               check (type in ('grade','alert','message','system')),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_student on public.notifications(student_id, created_at desc);

-- messages: two-way Q&A between a student and their advisor -----------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  advisor_id  uuid references public.profiles(id) on delete set null,
  sender_id   uuid references public.profiles(id) on delete set null,
  sender_role text not null default 'student',
  body        text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_msg_student on public.messages(student_id, created_at);

-- =============================================================== FUNCTIONS ===
-- SECURITY DEFINER helpers read `profiles` while bypassing RLS, so policies can
-- reference the caller's role/profile without causing infinite recursion.

create or replace function public.my_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid();
$$;

-- On auth signup: link to an existing (seeded) profile with the same email,
-- otherwise create a fresh profile from the signup metadata.
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
    insert into public.profiles (user_id, role, full_name, email, student_code, program, cohort)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'role', 'student'),
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      new.email,
      nullif(new.raw_user_meta_data->>'student_code', ''),
      coalesce(new.raw_user_meta_data->>'program', ''),
      coalesce(new.raw_user_meta_data->>'cohort', '')
    );
  end if;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==================================================================== RLS ===
alter table public.profiles      enable row level security;
alter table public.courses       enable row level security;
alter table public.risk_scores   enable row level security;
alter table public.alerts        enable row level security;
alter table public.interventions enable row level security;
alter table public.notifications enable row level security;
alter table public.messages      enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  user_id = auth.uid()
  or my_role() in ('advisor','manager')
  or role in ('advisor','manager')     -- anyone may read advisor/manager cards
);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (
  my_role() in ('advisor','manager')
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (
  my_role() in ('advisor','manager')
) with check (
  my_role() in ('advisor','manager')
);

-- courses (students read own; advisors manage) ------------------------------
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses for select using (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);
drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses for all using (
  my_role() in ('advisor','manager')
) with check (
  my_role() in ('advisor','manager')
);

-- risk_scores / alerts / interventions (advisor-only) -----------------------
drop policy if exists risk_advisor on public.risk_scores;
create policy risk_advisor on public.risk_scores for all using (
  my_role() in ('advisor','manager')
) with check (
  my_role() in ('advisor','manager')
);

drop policy if exists alerts_advisor on public.alerts;
create policy alerts_advisor on public.alerts for all using (
  my_role() in ('advisor','manager')
) with check (
  my_role() in ('advisor','manager')
);

drop policy if exists interventions_advisor on public.interventions;
create policy interventions_advisor on public.interventions for all using (
  my_role() in ('advisor','manager')
) with check (
  my_role() in ('advisor','manager')
);

-- notifications (student reads own + marks read; advisor sends) --------------
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select using (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert with check (
  my_role() in ('advisor','manager')
);
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
) with check (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);

-- messages (student and their advisor can read/write the thread) ------------
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select using (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert with check (
  sender_id = my_profile_id()
  and (student_id = my_profile_id() or my_role() in ('advisor','manager'))
);
drop policy if exists msg_update on public.messages;
create policy msg_update on public.messages for update using (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
) with check (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);

-- PostgREST needs table privileges even with RLS on; RLS still gates rows.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;

-- =============================================================== REALTIME ===
-- REPLICA IDENTITY FULL so realtime payloads carry the columns we filter on.
alter table public.courses       replica identity full;
alter table public.notifications replica identity full;
alter table public.messages      replica identity full;
alter table public.alerts        replica identity full;
alter table public.risk_scores   replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.courses;       exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.notifications; exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.messages;      exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.alerts;        exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.risk_scores;   exception when others then null; end;
end $$;

-- Done. Next: run seed.sql for demo data.

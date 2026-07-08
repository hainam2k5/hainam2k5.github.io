-- =============================================================================
-- OPTIONAL hardening: enforce "advisor manages only their own major/students"
-- at the DATABASE level (Row Level Security), not just in the UI.
--
-- Run AFTER schema.sql (and hardening.sql) in the Supabase SQL Editor.
-- Managers keep full access. Without this file the app still scopes advisors in
-- the UI, but any advisor's token could technically read other majors' students
-- by calling the Supabase API directly.
--
-- Visibility matrix after this migration:
--   student  → own data only (unchanged)
--   advisor  → students with advisor_id = them (plus unassigned students, so a
--              new self-registered student can be claimed), and ONLY those
--              students' courses/risk/alerts/interventions/notifications/messages
--   manager  → everything
-- =============================================================================

-- Helper: is `sid` a student the CALLER may manage? (SECURITY DEFINER → no RLS
-- recursion). Managers: always yes. Advisors: their students + unassigned.
create or replace function public.is_my_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles st
      join public.profiles me on me.user_id = auth.uid()
     where st.id = sid
       and ( me.role = 'manager'
             or (me.role = 'advisor' and (st.advisor_id = me.id or st.advisor_id is null)) )
  );
$$;

-- Helper: which student does an alert belong to (bypasses alerts RLS safely).
create or replace function public.alert_student(aid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select student_id from public.alerts where id = aid;
$$;

-- profiles --------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  user_id = auth.uid()
  or (auth.uid() is not null and role in ('advisor','manager'))  -- advisor cards
  or (role = 'student' and is_my_student(id))
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (
  my_role() = 'manager'
  or (my_role() = 'advisor' and role = 'student' and is_my_student(id))
) with check (
  my_role() = 'manager'
  or (my_role() = 'advisor' and role = 'student')
);

-- courses -----------------------------------------------------------------------
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses for select using (
  student_id = my_profile_id() or is_my_student(student_id)
);
drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses for all using (
  my_role() in ('advisor','manager') and is_my_student(student_id)
) with check (
  my_role() in ('advisor','manager') and is_my_student(student_id)
);

-- risk_scores / alerts / interventions ------------------------------------------
drop policy if exists risk_advisor on public.risk_scores;
create policy risk_advisor on public.risk_scores for all using (
  my_role() in ('advisor','manager') and is_my_student(student_id)
) with check (
  my_role() in ('advisor','manager') and is_my_student(student_id)
);

drop policy if exists alerts_advisor on public.alerts;
create policy alerts_advisor on public.alerts for all using (
  my_role() in ('advisor','manager') and is_my_student(student_id)
) with check (
  my_role() in ('advisor','manager') and is_my_student(student_id)
);

drop policy if exists interventions_advisor on public.interventions;
create policy interventions_advisor on public.interventions for all using (
  my_role() in ('advisor','manager') and is_my_student(alert_student(alert_id))
) with check (
  my_role() in ('advisor','manager') and is_my_student(alert_student(alert_id))
);

-- notifications -------------------------------------------------------------------
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select using (
  student_id = my_profile_id() or is_my_student(student_id)
);
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert with check (
  my_role() in ('advisor','manager') and is_my_student(student_id)
);
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (
  student_id = my_profile_id() or is_my_student(student_id)
) with check (
  student_id = my_profile_id() or is_my_student(student_id)
);

-- messages ------------------------------------------------------------------------
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select using (
  student_id = my_profile_id() or is_my_student(student_id)
);
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert with check (
  sender_id = my_profile_id()
  and (student_id = my_profile_id() or is_my_student(student_id))
);
drop policy if exists msg_update on public.messages;
create policy msg_update on public.messages for update using (
  student_id = my_profile_id() or is_my_student(student_id)
) with check (
  student_id = my_profile_id() or is_my_student(student_id)
);

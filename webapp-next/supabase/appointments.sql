-- =============================================================================
-- Advisor appointments: a student books a meeting slot with their advisor;
-- the advisor confirms / cancels. Run once in the Supabase SQL Editor.
-- =============================================================================
create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  advisor_id  uuid references public.profiles(id) on delete set null,
  starts_at   timestamptz not null,
  note        text default '',
  status      text not null default 'requested'
                check (status in ('requested','confirmed','cancelled','done')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_appt_student on public.appointments(student_id, starts_at);

alter table public.appointments enable row level security;

-- Student manages their own; advisor/manager read + update (confirm/cancel).
drop policy if exists appt_select on public.appointments;
create policy appt_select on public.appointments for select using (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);
drop policy if exists appt_insert on public.appointments;
create policy appt_insert on public.appointments for insert with check (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);
drop policy if exists appt_update on public.appointments;
create policy appt_update on public.appointments for update using (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
) with check (
  student_id = my_profile_id() or my_role() in ('advisor','manager')
);

-- Realtime (optional): so both sides see status changes live.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='appointments') then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;

-- =============================================================================
-- Grade lock: mark a course's grades as finalized so they can't be edited by
-- accident. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Without this column the app treats every course as unlocked (editable) — the
-- lock button just won't have any effect until this runs.
-- =============================================================================
alter table public.courses
  add column if not exists locked boolean not null default false;

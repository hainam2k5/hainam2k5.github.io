-- =============================================================================
-- Configurable risk weights & thresholds (single global row). Run in the
-- Supabase SQL Editor. Managers can then edit these from the "Đánh giá" page;
-- everyone else reads them. Safe to run multiple times.
--
-- Without this table the app just uses the built-in defaults (0.40/0.30/0.15/0.15
-- and 40/65/85) — nothing breaks.
-- =============================================================================
create table if not exists public.risk_config (
  id           int     primary key default 1,
  w_gpa        numeric not null default 0.40,
  w_att        numeric not null default 0.30,
  w_lms        numeric not null default 0.15,
  w_fail       numeric not null default 0.15,
  th_medium    int     not null default 40,
  th_high      int     not null default 65,
  th_critical  int     not null default 85,
  updated_at   timestamptz not null default now(),
  constraint risk_config_singleton check (id = 1)
);

insert into public.risk_config (id) values (1) on conflict (id) do nothing;

alter table public.risk_config enable row level security;

-- Read: any signed-in user. Write: managers only.
drop policy if exists risk_config_read on public.risk_config;
create policy risk_config_read on public.risk_config for select using (auth.uid() is not null);

drop policy if exists risk_config_write on public.risk_config;
create policy risk_config_write on public.risk_config for update using (
  exists (select 1 from public.profiles where user_id = auth.uid() and role = 'manager')
) with check (
  exists (select 1 from public.profiles where user_id = auth.uid() and role = 'manager')
);

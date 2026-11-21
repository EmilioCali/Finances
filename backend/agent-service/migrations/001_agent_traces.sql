-- ScenarioLab TKT-003 — agent_traces (Supabase PostgreSQL)
-- Apply in Supabase SQL editor or via migration tooling.
-- Does not replace the Financial Engine SQLite store until TKT-001 confirms Postgres.

create extension if not exists "pgcrypto";

create table if not exists public.agent_traces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  request_message text not null,
  interpreted_params jsonb null,
  approved_params jsonb null,
  scenario_id text null,
  result_ref text null,
  status text not null check (
    status in ('INTERPRETED', 'NEEDS_CONFIRMATION', 'EXPLAINED', 'ERROR')
  ),
  error jsonb null,
  explanation text null,
  idempotency_key text null
);

create index if not exists agent_traces_idempotency_key_idx
  on public.agent_traces (idempotency_key);

create index if not exists agent_traces_scenario_id_idx
  on public.agent_traces (scenario_id);

create index if not exists agent_traces_created_at_idx
  on public.agent_traces (created_at desc);

comment on table public.agent_traces is
  'TKT-003 agent audit trail. Monetary figures always come from the financial engine.';

-- Optional: deny anon access; service role used by agent-service only.
alter table public.agent_traces enable row level security;

drop policy if exists agent_traces_no_anon on public.agent_traces;
create policy agent_traces_no_anon
  on public.agent_traces
  for all
  to anon
  using (false)
  with check (false);

-- ============================================================
-- CTG BEP Calculator — Supabase Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- scenarios: each user's saved break-even scenarios
-- ------------------------------------------------------------
create table if not exists public.scenarios (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  color         text,
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists scenarios_user_id_idx     on public.scenarios(user_id);
create index if not exists scenarios_updated_at_idx  on public.scenarios(user_id, updated_at desc);

-- ------------------------------------------------------------
-- Auto-update updated_at on row change
-- ------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists scenarios_set_updated_at on public.scenarios;
create trigger scenarios_set_updated_at
  before update on public.scenarios
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security: each user can only touch their own rows
-- ------------------------------------------------------------
alter table public.scenarios enable row level security;

drop policy if exists "scenarios_select_own" on public.scenarios;
create policy "scenarios_select_own"
  on public.scenarios for select
  using (auth.uid() = user_id);

drop policy if exists "scenarios_insert_own" on public.scenarios;
create policy "scenarios_insert_own"
  on public.scenarios for insert
  with check (auth.uid() = user_id);

drop policy if exists "scenarios_update_own" on public.scenarios;
create policy "scenarios_update_own"
  on public.scenarios for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "scenarios_delete_own" on public.scenarios;
create policy "scenarios_delete_own"
  on public.scenarios for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Done. Verify in: Supabase Dashboard → Table Editor → scenarios
-- ------------------------------------------------------------

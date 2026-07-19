-- SERA Twin Wallet Identity foundation. Execute through Supabase migrations.
-- The Auth user ID is the only stable internal primary key; wallet addresses
-- remain verified public identities and can be replaced or added over time.

create table if not exists public.sera_users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sera_users(id) on delete cascade,
  kind text not null check (kind in ('EMAIL', 'GOOGLE', 'EXTERNAL_WALLET')),
  provider text not null,
  subject text not null,
  verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (provider, subject)
);

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sera_users(id) on delete cascade,
  kind text not null check (kind in ('PERSONAL', 'AGENT')),
  provider text not null check (provider in ('EXTERNAL', 'REOWN', 'THIRDWEB', 'BASE_ACCOUNT', 'LOCAL_DEVELOPMENT')),
  provider_wallet_id text,
  chain text not null,
  address text,
  status text not null check (status in ('PROVISIONING', 'READY', 'FAILED_RETRYABLE', 'REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind),
  unique (chain, address),
  unique (provider, provider_wallet_id)
);

create table if not exists public.wallet_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sera_users(id) on delete cascade,
  wallet_account_id uuid not null references public.wallet_accounts(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null check (status in ('PENDING', 'RUNNING', 'RETRYABLE_FAILURE', 'COMPLETED', 'FAILED')),
  attempts integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operating_agreements (
  id text primary key,
  user_id uuid not null references public.sera_users(id) on delete cascade,
  title text not null,
  intent text not null,
  mode text not null check (mode in ('ASSISTANT', 'FULL_ACCESS')),
  permissions jsonb not null,
  status text not null check (status in ('ACTIVE', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz,
  last_action_summary text,
  next_action_summary text,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.active_intents (
  id text primary key,
  user_id uuid not null references public.sera_users(id) on delete cascade,
  agreement_id text references public.operating_agreements(id) on delete set null,
  product_id text not null,
  description text not null,
  status text not null check (status in ('ALIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.execution_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sera_users(id) on delete cascade,
  agreement_id text references public.operating_agreements(id) on delete set null,
  intent_id text references public.active_intents(id) on delete set null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.sera_users enable row level security;
alter table public.auth_identities enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_provisioning_jobs enable row level security;
alter table public.operating_agreements enable row level security;
alter table public.active_intents enable row level security;
alter table public.execution_audit_events enable row level security;

drop policy if exists "Users read their own SERA profile" on public.sera_users;
drop policy if exists "Users read their own linked identities" on public.auth_identities;
drop policy if exists "Users read their own wallets" on public.wallet_accounts;
drop policy if exists "Users read their own wallet provisioning status" on public.wallet_provisioning_jobs;
drop policy if exists "Users read their own operating agreements" on public.operating_agreements;
drop policy if exists "Users read their own active intents" on public.active_intents;
drop policy if exists "Users read their own execution audit events" on public.execution_audit_events;

create policy "Users read their own SERA profile" on public.sera_users
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users read their own linked identities" on public.auth_identities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their own wallets" on public.wallet_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their own wallet provisioning status" on public.wallet_provisioning_jobs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their own operating agreements" on public.operating_agreements
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their own active intents" on public.active_intents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their own execution audit events" on public.execution_audit_events
  for select to authenticated using ((select auth.uid()) = user_id);

-- Writes are backend-only through a server credential; clients receive only
-- the minimum read access above. Never store private keys or raw wallet secrets
-- in these tables.

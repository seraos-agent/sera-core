-- Durable, server-written audit trail for wallet transfers. A request ID is
-- unique so retried requests update the same lifecycle record rather than
-- creating an ambiguous duplicate transfer history.

create table if not exists public.wallet_transfer_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sera_users(id) on delete cascade,
  idempotency_key text not null unique,
  approval_source text not null check (approval_source in ('GOVERNED_ACTION', 'DIRECT_UI')),
  source_wallet text not null,
  destination_wallet text not null,
  chain text not null,
  asset text not null,
  amount numeric(36, 18) not null check (amount > 0),
  status text not null check (status in ('APPROVED', 'BROADCAST', 'CONFIRMED', 'FAILED')),
  transaction_hash text unique,
  failure_reason text,
  broadcast_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_transfer_events_user_created_at_idx
  on public.wallet_transfer_events (user_id, created_at desc);

create index if not exists wallet_transfer_events_transaction_hash_idx
  on public.wallet_transfer_events (transaction_hash)
  where transaction_hash is not null;

alter table public.wallet_transfer_events enable row level security;

drop policy if exists "Users read their own wallet transfer events" on public.wallet_transfer_events;

create policy "Users read their own wallet transfer events" on public.wallet_transfer_events
  for select to authenticated using ((select auth.uid()) = user_id);

-- Writes are performed only by Core with its server credential. Transaction
-- history must never include a private key, signature, or raw secret.

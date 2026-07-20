-- OAuth delegation only: no cognitive memory or Drive file content is stored
-- in Supabase. The encrypted refresh token lets Core access the user's own
-- Google Drive vault while the user is offline; it is revocable at any time.
create table if not exists public.user_cloud_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sera_users(id) on delete cascade,
  provider text not null check (provider in ('GOOGLE_DRIVE')),
  status text not null check (status in ('CONNECTED', 'REVOKED')),
  refresh_token_ciphertext text,
  vault_folder_id text,
  scopes text[] not null default '{}',
  connected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.user_cloud_connections enable row level security;

-- Connection credentials are never readable from the client. The backend uses
-- its server-only Supabase credential and exposes only connection status.

-- Migration: User Cloud Connections
-- Stores encrypted OAuth refresh tokens and connection state for external services (Google Drive, etc)

create table public.user_cloud_connections (
  user_id text not null,
  provider text not null,
  status text not null,
  refresh_token_ciphertext text,
  vault_folder_id text,
  scopes text[] default '{}',
  connected_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz default now(),
  primary key (user_id, provider)
);

-- Enable RLS
alter table public.user_cloud_connections enable row level security;

-- Only service role can access and manage cloud connections
create policy "Service role can manage user_cloud_connections"
  on public.user_cloud_connections
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

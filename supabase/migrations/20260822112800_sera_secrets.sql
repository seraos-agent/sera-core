create table public.sera_secrets (
  id text primary key,
  iv text not null,
  tag text not null,
  ciphertext text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.sera_secrets enable row level security;

-- Only service role can access secrets
create policy "Service role can manage secrets"
  on public.sera_secrets
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

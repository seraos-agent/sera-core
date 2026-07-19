-- Reown/Web3Modal is SERA's primary authentication surface. SERA users may
-- therefore be proven by a verified wallet signature without also owning a
-- Supabase Auth account. Keep the internal UUID independent from auth.users.

alter table public.sera_users
  drop constraint if exists sera_users_id_fkey;

alter table public.sera_users
  alter column id set default gen_random_uuid();

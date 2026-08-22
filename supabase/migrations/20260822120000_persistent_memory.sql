-- Migration: Persistent Memory Tables for SERA Cognitive System
-- This migration creates the database schema required for SERA's agent memory
-- to survive Cloud Run container restarts.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Enable pgvector extension (Supabase includes this by default)
-- ═══════════════════════════════════════════════════════════════════════════════
create extension if not exists vector with schema extensions;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Vector Memory — stores episodic embeddings for semantic recall
-- ═══════════════════════════════════════════════════════════════════════════════
create table public.sera_vector_memories (
  id text not null,
  session_id text not null,
  embedding extensions.vector(1024),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  primary key (id, session_id)
);

create index idx_vector_memories_session on public.sera_vector_memories (session_id);

-- IVFFlat index for cosine similarity search. Optimal for < 100K records.
-- If SERA scales beyond 1M records, switch to HNSW (one-line migration).
create index idx_vector_memories_embedding on public.sera_vector_memories
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 50);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Episodic Memory — consolidated experience summaries
-- ═══════════════════════════════════════════════════════════════════════════════
create table public.sera_episodic_memories (
  id text not null,
  session_id text not null,
  summary text not null,
  type text not null,
  evidence jsonb default '[]',
  created_at timestamptz default now(),
  primary key (id, session_id)
);

create index idx_episodic_session on public.sera_episodic_memories (session_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Working Memory Snapshots — beliefs & events checkpoint
-- ═══════════════════════════════════════════════════════════════════════════════
create table public.sera_memory_snapshots (
  session_id text primary key,
  snapshot jsonb not null,
  updated_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. RPC function for pgvector similarity search
--    Called from SupabaseRestClient via POST /rest/v1/rpc/match_vector_memories
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.match_vector_memories(
  query_embedding extensions.vector(1024),
  match_session_id text,
  match_threshold float default 0.5,
  match_count int default 3
)
returns table (
  id text,
  session_id text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    svm.id,
    svm.session_id,
    svm.metadata,
    svm.created_at,
    1 - (svm.embedding <=> query_embedding) as similarity
  from public.sera_vector_memories svm
  where svm.session_id = match_session_id
    and 1 - (svm.embedding <=> query_embedding) >= match_threshold
  order by svm.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Row Level Security — service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
alter table public.sera_vector_memories enable row level security;
alter table public.sera_episodic_memories enable row level security;
alter table public.sera_memory_snapshots enable row level security;

create policy "service_role_vector" on public.sera_vector_memories
  for all to service_role using (true) with check (true);

create policy "service_role_episodic" on public.sera_episodic_memories
  for all to service_role using (true) with check (true);

create policy "service_role_snapshots" on public.sera_memory_snapshots
  for all to service_role using (true) with check (true);

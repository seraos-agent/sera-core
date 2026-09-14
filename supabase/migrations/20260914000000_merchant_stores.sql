-- Migration: Merchant Stores & Operating Hours
-- Stores multi-merchant business profiles, operational schedules, coverage area, and owner WhatsApp dispatch info

create table if not exists public.merchant_stores (
  store_id text primary key,
  store_name text not null,
  business_type text not null default 'GOODS', -- 'GOODS' or 'SERVICE'
  category text,
  owner_whatsapp text not null, -- clean digits e.g. '628123456789'
  address text,
  coverage_area text,
  description text,
  logo_url text,
  timezone text default 'Asia/Jakarta',
  operating_hours jsonb not null default '{"open": "09:00", "close": "21:00", "days": [1, 2, 3, 4, 5, 6, 7]}'::jsonb,
  is_open_override boolean, -- true: force open, false: force closed/holiday, null: follow schedule
  allow_pre_order boolean default true,
  notice text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for fast owner lookup when incoming messages arrive
create index if not exists idx_merchant_stores_owner on public.merchant_stores (owner_whatsapp);
create index if not exists idx_merchant_stores_business_type on public.merchant_stores (business_type);

-- Enable RLS
alter table public.merchant_stores enable row level security;

-- Service role policy
create policy "Service role can manage merchant_stores"
  on public.merchant_stores
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

-- Migration: Marketplace Products & Store Geolocation
-- Adds latitude, longitude, and user_id to merchant_stores
-- Creates merchant_products table for fast multi-merchant catalog management
-- Creates buyer saved locations table for frictionless re-ordering

alter table public.merchant_stores
  add column if not exists user_id text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

create index if not exists idx_merchant_stores_geo on public.merchant_stores (latitude, longitude);
create index if not exists idx_merchant_stores_user on public.merchant_stores (user_id);

-- 1. Merchant Products Table
create table if not exists public.merchant_products (
  id text primary key,
  store_id text not null references public.merchant_stores(store_id) on delete cascade,
  retailer_id text not null,
  name text not null,
  price numeric not null default 0,
  currency text not null default 'IDR',
  image_url text,
  category text,
  description text,
  availability text not null default 'in stock', -- 'in stock' or 'out of stock'
  business_type text not null default 'GOODS', -- 'GOODS' or 'SERVICE'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_merchant_products_store on public.merchant_products (store_id);
create index if not exists idx_merchant_products_retailer on public.merchant_products (retailer_id);
create index if not exists idx_merchant_products_category on public.merchant_products (category);

alter table public.merchant_products enable row level security;

create policy "Service role can manage merchant_products"
  on public.merchant_products
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

-- 2. Buyer Saved Locations Table (for frictionless "Ingat Lokasi" re-ordering)
create table if not exists public.buyer_saved_locations (
  phone text primary key, -- e.g. '628123456789'
  latitude numeric not null,
  longitude numeric not null,
  name text,
  address text,
  updated_at timestamptz default now()
);

alter table public.buyer_saved_locations enable row level security;

create policy "Service role can manage buyer_saved_locations"
  on public.buyer_saved_locations
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

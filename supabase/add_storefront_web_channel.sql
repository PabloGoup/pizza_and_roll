do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'order_source'
  ) then
    create type public.order_source as enum ('pos', 'web', 'whatsapp');
  end if;
end $$;

create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  store_name text not null default 'P&R_ventas',
  support_phone text,
  is_store_open boolean not null default true,
  pickup_base_minutes integer not null default 20,
  delivery_base_minutes integer not null default 35,
  per_pending_order_minutes integer not null default 3,
  high_load_threshold integer not null default 5,
  currency_code text not null default 'CLP',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint store_settings_singleton_check check (pickup_base_minutes >= 0 and delivery_base_minutes >= 0 and per_pending_order_minutes >= 0 and high_load_threshold >= 0)
);

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  fee numeric(12, 2) not null default 0,
  base_minutes integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint delivery_zones_fee_check check (fee >= 0),
  constraint delivery_zones_minutes_check check (base_minutes >= 0)
);

alter table public.orders
  add column if not exists source public.order_source not null default 'pos',
  add column if not exists estimated_ready_at timestamptz,
  add column if not exists customer_phone_snapshot text,
  add column if not exists customer_name_snapshot text;

update public.orders o
set
  customer_phone_snapshot = coalesce(o.customer_phone_snapshot, c.phone),
  customer_name_snapshot = coalesce(o.customer_name_snapshot, c.full_name)
from public.customers c
where o.customer_id = c.id
  and (o.customer_phone_snapshot is null or o.customer_name_snapshot is null);

alter table public.dispatch_orders
  add column if not exists delivery_fee numeric(12, 2) not null default 0,
  add column if not exists estimated_delivery_at timestamptz,
  add column if not exists zone_id uuid references public.delivery_zones(id);

create index if not exists idx_orders_source on public.orders(source, created_at desc);
create index if not exists idx_orders_estimated_ready_at on public.orders(estimated_ready_at);
create index if not exists idx_delivery_zones_active on public.delivery_zones(is_active, sort_order, district);
create index if not exists idx_dispatch_orders_zone on public.dispatch_orders(zone_id);

alter table public.store_settings enable row level security;
alter table public.delivery_zones enable row level security;

drop policy if exists "store settings public read" on public.store_settings;
create policy "store settings public read" on public.store_settings
for select to anon, authenticated
using (true);

drop policy if exists "store settings admin manage" on public.store_settings;
create policy "store settings admin manage" on public.store_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "delivery zones public read" on public.delivery_zones;
create policy "delivery zones public read" on public.delivery_zones
for select to anon, authenticated
using (is_active = true);

drop policy if exists "delivery zones admin manage" on public.delivery_zones;
create policy "delivery zones admin manage" on public.delivery_zones
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "categories public storefront read" on public.product_categories;
create policy "categories public storefront read" on public.product_categories
for select to anon, authenticated
using (true);

drop policy if exists "products public storefront read" on public.products;
create policy "products public storefront read" on public.products
for select to anon, authenticated
using (status = 'activo');

drop policy if exists "variants public storefront read" on public.product_variants;
create policy "variants public storefront read" on public.product_variants
for select to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_variants.product_id
      and p.status = 'activo'
  )
);

drop policy if exists "modifier groups public storefront read" on public.product_modifier_groups;
create policy "modifier groups public storefront read" on public.product_modifier_groups
for select to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_modifier_groups.product_id
      and p.status = 'activo'
  )
);

drop policy if exists "modifiers public storefront read" on public.product_modifiers;
create policy "modifiers public storefront read" on public.product_modifiers
for select to anon, authenticated
using (
  exists (
    select 1
    from public.product_modifier_groups pmg
    join public.products p on p.id = pmg.product_id
    where pmg.id = product_modifiers.modifier_group_id
      and p.status = 'activo'
  )
);

drop policy if exists "promotions public storefront read" on public.promotions;
create policy "promotions public storefront read" on public.promotions
for select to anon, authenticated
using (is_active = true);

insert into public.store_settings (
  store_name,
  support_phone,
  is_store_open,
  pickup_base_minutes,
  delivery_base_minutes,
  per_pending_order_minutes,
  high_load_threshold,
  currency_code
)
select
  'P&R_ventas',
  null,
  true,
  20,
  35,
  3,
  5,
  'CLP'
where not exists (
  select 1 from public.store_settings
);

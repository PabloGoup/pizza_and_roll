create extension if not exists pgcrypto;

create type public.app_role as enum ('administrador', 'cajero', 'cliente');
create type public.product_status as enum ('activo', 'inactivo');
create type public.order_type as enum ('consumo_local', 'retiro_local', 'despacho');
create type public.order_status as enum ('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado');
create type public.payment_method as enum ('efectivo', 'tarjeta', 'transferencia', 'mixto');
create type public.cash_session_status as enum ('abierta', 'cerrada');
create type public.cash_movement_type as enum ('apertura', 'ingreso', 'retiro', 'anulacion', 'diferencia', 'cierre');
create type public.inventory_movement_type as enum ('compra', 'ajuste', 'merma', 'consumo_venta', 'salida_manual');
create type public.unit_code as enum ('g', 'kg', 'ml', 'l', 'unidad');
create type public.dispatch_status as enum ('pendiente', 'en_preparacion', 'en_ruta', 'entregado', 'cancelado');
create type public.promotion_type as enum ('combo', 'porcentaje', 'monto_fijo', 'horario', 'cantidad', 'combinada');
create type public.payroll_adjustment_type as enum ('bono', 'descuento', 'adelanto_dinero', 'adelanto_alimentos');
create type public.order_source as enum ('pos', 'web', 'whatsapp');

create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'cliente',
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null,
  detail text not null,
  performed_by uuid references public.profiles(id),
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#f97316',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id) on delete restrict,
  sort_order integer not null default 0,
  name text not null,
  description text not null default '',
  image_url text,
  base_price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  is_favorite boolean not null default false,
  status public.product_status not null default 'activo',
  tags text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  is_default boolean not null default false
);

create table if not exists public.product_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  min_select integer not null default 0,
  max_select integer not null default 5
);

create table if not exists public.product_modifiers (
  id uuid primary key default gen_random_uuid(),
  modifier_group_id uuid not null references public.product_modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12, 2) not null default 0,
  default_included boolean not null default false
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null default 'Principal',
  street text not null,
  district text not null,
  reference text,
  is_default boolean not null default false
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('PR-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  source public.order_source not null default 'pos',
  type public.order_type not null,
  status public.order_status not null default 'pendiente',
  payment_method public.payment_method not null,
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  promotion_amount numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  extra_charges jsonb not null default '[]'::jsonb,
  total numeric(12, 2) not null default 0,
  notes text,
  cashier_id uuid not null references public.profiles(id),
  customer_id uuid references public.customers(id),
  delivery_address_id uuid references public.customer_addresses(id),
  estimated_ready_at timestamptz,
  customer_phone_snapshot text,
  customer_name_snapshot text,
  cancellation_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(12, 2) not null default 0
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  notes text
);

create table if not exists public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  modifier_id uuid references public.product_modifiers(id),
  modifier_name_snapshot text not null,
  price_delta numeric(12, 2) not null default 0
);

create table if not exists public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status public.order_status not null default 'pendiente',
  printed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dispatch_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status public.dispatch_status not null default 'pendiente',
  zone_id uuid references public.delivery_zones(id),
  contact_name text,
  contact_phone text,
  delivery_fee numeric(12, 2) not null default 0,
  estimated_delivery_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
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
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references public.profiles(id),
  opening_amount numeric(12, 2) not null default 0,
  expected_amount numeric(12, 2) not null default 0,
  expected_cash_sales_amount numeric(12, 2) not null default 0,
  expected_card_amount numeric(12, 2) not null default 0,
  expected_transfer_amount numeric(12, 2) not null default 0,
  counted_amount numeric(12, 2),
  counted_card_amount numeric(12, 2),
  counted_transfer_amount numeric(12, 2),
  difference_amount numeric(12, 2),
  difference_card_amount numeric(12, 2),
  difference_transfer_amount numeric(12, 2),
  notes text,
  status public.cash_session_status not null default 'abierta',
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  type public.cash_movement_type not null,
  amount numeric(12, 2) not null default 0,
  reason text not null,
  performed_by uuid not null references public.profiles(id),
  linked_order_id uuid references public.orders(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type public.promotion_type not null,
  value numeric(12, 2) not null default 0,
  start_at timestamptz,
  end_at timestamptz,
  is_active boolean not null default true,
  rules jsonb not null default '{}'::jsonb
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit public.unit_code not null,
  current_stock numeric(14, 3) not null default 0,
  minimum_stock numeric(14, 3) not null default 0,
  average_cost numeric(12, 4) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  expected_margin numeric(8, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14, 3) not null default 0,
  unit_cost numeric(12, 4) not null default 0
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  type public.inventory_movement_type not null,
  quantity numeric(14, 3) not null,
  unit_cost numeric(12, 4),
  reference_table text,
  reference_id uuid,
  notes text,
  performed_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  contact_name text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  purchase_date date not null default current_date,
  payment_method public.payment_method,
  total_amount numeric(12, 2) not null default 0,
  document_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  quantity numeric(14, 3) not null,
  unit_cost numeric(12, 4) not null,
  line_total numeric(12, 2) not null default 0
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role_name text not null,
  hire_date date not null default current_date,
  base_salary numeric(12, 2) not null default 0,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.employee_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type public.payroll_adjustment_type not null,
  amount numeric(12, 2) not null default 0,
  description text not null,
  effective_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_label text not null,
  payment_date date not null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  gross_salary numeric(12, 2) not null default 0,
  bonuses numeric(12, 2) not null default 0,
  discounts numeric(12, 2) not null default 0,
  advances numeric(12, 2) not null default 0,
  net_salary numeric(12, 2) not null default 0
);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'administrador', false)
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'cliente')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute procedure public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products for each row execute procedure public.touch_updated_at();

drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at before update on public.customers for each row execute procedure public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders for each row execute procedure public.touch_updated_at();

drop trigger if exists kitchen_tickets_touch_updated_at on public.kitchen_tickets;
create trigger kitchen_tickets_touch_updated_at before update on public.kitchen_tickets for each row execute procedure public.touch_updated_at();

drop trigger if exists dispatch_orders_touch_updated_at on public.dispatch_orders;
create trigger dispatch_orders_touch_updated_at before update on public.dispatch_orders for each row execute procedure public.touch_updated_at();

drop trigger if exists ingredients_touch_updated_at on public.ingredients;
create trigger ingredients_touch_updated_at before update on public.ingredients for each row execute procedure public.touch_updated_at();

drop trigger if exists recipes_touch_updated_at on public.recipes;
create trigger recipes_touch_updated_at before update on public.recipes for each row execute procedure public.touch_updated_at();

drop trigger if exists employees_touch_updated_at on public.employees;
create trigger employees_touch_updated_at before update on public.employees for each row execute procedure public.touch_updated_at();

drop trigger if exists store_settings_touch_updated_at on public.store_settings;
create trigger store_settings_touch_updated_at before update on public.store_settings for each row execute procedure public.touch_updated_at();

drop trigger if exists delivery_zones_touch_updated_at on public.delivery_zones;
create trigger delivery_zones_touch_updated_at before update on public.delivery_zones for each row execute procedure public.touch_updated_at();

create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_cashier on public.orders(cashier_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_source on public.orders(source, created_at desc);
create index if not exists idx_orders_estimated_ready_at on public.orders(estimated_ready_at);
create index if not exists idx_cash_sessions_status on public.cash_sessions(status);
create index if not exists idx_cash_movements_session on public.cash_movements(session_id, created_at desc);
create index if not exists idx_audit_logs_module on public.audit_logs(module, created_at desc);
create index if not exists idx_inventory_movements_ingredient on public.inventory_movements(ingredient_id, created_at desc);
create index if not exists idx_employee_adjustments_employee on public.employee_adjustments(employee_id, effective_date desc);
create index if not exists idx_delivery_zones_active on public.delivery_zones(is_active, sort_order, district);
create index if not exists idx_dispatch_orders_zone on public.dispatch_orders(zone_id);

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_modifier_groups enable row level security;
alter table public.product_modifiers enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.kitchen_tickets enable row level security;
alter table public.dispatch_orders enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.promotions enable row level security;
alter table public.store_settings enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.employees enable row level security;
alter table public.employee_adjustments enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_entries enable row level security;

create policy "profiles read own or admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles admin manage" on public.profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "audit admin read" on public.audit_logs
for select to authenticated
using (public.is_admin());

create policy "audit staff insert" on public.audit_logs
for insert to authenticated
with check (performed_by = auth.uid());

create policy "categories staff read" on public.product_categories
for select to authenticated
using (true);

create policy "categories public storefront read" on public.product_categories
for select to anon, authenticated
using (true);

create policy "categories admin manage" on public.product_categories
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "products staff read" on public.products
for select to authenticated
using (true);

create policy "products public storefront read" on public.products
for select to anon, authenticated
using (status = 'activo');

create policy "products admin manage" on public.products
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "product variants staff read" on public.product_variants
for select to authenticated
using (true);

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

create policy "product variants admin manage" on public.product_variants
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "modifier groups staff read" on public.product_modifier_groups
for select to authenticated
using (true);

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

create policy "modifier groups admin manage" on public.product_modifier_groups
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "modifiers staff read" on public.product_modifiers
for select to authenticated
using (true);

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

create policy "modifiers admin manage" on public.product_modifiers
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "customers staff manage" on public.customers
for all to authenticated
using (true)
with check (true);

create policy "customer addresses staff manage" on public.customer_addresses
for all to authenticated
using (true)
with check (true);

create policy "orders staff manage" on public.orders
for all to authenticated
using (true)
with check (cashier_id = auth.uid() or public.is_admin());

create policy "order payments staff manage" on public.order_payments
for all to authenticated
using (true)
with check (true);

create policy "order items staff manage" on public.order_items
for all to authenticated
using (true)
with check (true);

create policy "order item modifiers staff manage" on public.order_item_modifiers
for all to authenticated
using (true)
with check (true);

create policy "kitchen tickets staff manage" on public.kitchen_tickets
for all to authenticated
using (true)
with check (true);

create policy "dispatch staff manage" on public.dispatch_orders
for all to authenticated
using (true)
with check (true);

create policy "cash sessions staff manage" on public.cash_sessions
for all to authenticated
using (true)
with check (cashier_id = auth.uid() or public.is_admin());

create policy "cash movements staff manage" on public.cash_movements
for all to authenticated
using (true)
with check (performed_by = auth.uid() or public.is_admin());

create policy "promotions staff read" on public.promotions
for select to authenticated
using (true);

create policy "promotions public storefront read" on public.promotions
for select to anon, authenticated
using (is_active = true);

create policy "promotions admin manage" on public.promotions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "store settings public read" on public.store_settings
for select to anon, authenticated
using (true);

create policy "store settings admin manage" on public.store_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "delivery zones public read" on public.delivery_zones
for select to anon, authenticated
using (is_active = true);

create policy "delivery zones admin manage" on public.delivery_zones
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "inventory admin manage" on public.ingredients
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "recipes admin manage" on public.recipes
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "recipe items admin manage" on public.recipe_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "inventory movements admin manage" on public.inventory_movements
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "suppliers admin manage" on public.suppliers
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "purchases admin manage" on public.purchases
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "purchase items admin manage" on public.purchase_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "employees admin manage" on public.employees
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "employee adjustments admin manage" on public.employee_adjustments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "payroll runs admin manage" on public.payroll_runs
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "payroll entries admin manage" on public.payroll_entries
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

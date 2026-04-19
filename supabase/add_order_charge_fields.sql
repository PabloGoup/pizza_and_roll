alter table public.orders
add column if not exists delivery_fee numeric(12, 2) not null default 0;

alter table public.orders
add column if not exists extra_charges jsonb not null default '[]'::jsonb;

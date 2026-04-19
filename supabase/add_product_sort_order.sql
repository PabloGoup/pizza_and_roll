alter table public.products
add column if not exists sort_order integer not null default 0;

with ranked_products as (
  select
    id,
    row_number() over (
      partition by category_id
      order by created_at asc, name asc, id asc
    ) as next_sort_order
  from public.products
)
update public.products as products
set sort_order = ranked_products.next_sort_order
from ranked_products
where products.id = ranked_products.id
  and products.sort_order = 0;

create index if not exists products_category_sort_idx
on public.products (category_id, status, sort_order, name);

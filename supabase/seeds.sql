insert into public.product_categories (id, name, color, sort_order)
values
  ('11111111-1111-1111-1111-111111111111', 'Pizzas', '#c2410c', 1),
  ('22222222-2222-2222-2222-222222222222', 'Sushi', '#0f766e', 2),
  ('33333333-3333-3333-3333-333333333333', 'Bebidas', '#1d4ed8', 3),
  ('44444444-4444-4444-4444-444444444444', 'Postres', '#a16207', 4)
on conflict (id) do update
set
  name = excluded.name,
  color = excluded.color,
  sort_order = excluded.sort_order;

insert into public.products (
  id,
  category_id,
  name,
  description,
  base_price,
  cost,
  is_favorite,
  status,
  tags
)
values
  (
    'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    'Pizza Pepperoni Familiar',
    'Salsa pomodoro, mozzarella y pepperoni crocante.',
    15990,
    6700,
    true,
    'activo',
    array['pizza', 'favorito']
  ),
  (
    'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '22222222-2222-2222-2222-222222222222',
    'Promo 30 piezas tempura',
    'Selección de rolls tempura con salsa aparte.',
    18990,
    7900,
    true,
    'activo',
    array['sushi', 'combo']
  ),
  (
    'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '33333333-3333-3333-3333-333333333333',
    'Bebida 1.5L',
    'Coca-Cola o Sprite.',
    3490,
    1200,
    true,
    'activo',
    array['bebida']
  )
on conflict (id) do update
set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  base_price = excluded.base_price,
  cost = excluded.cost,
  is_favorite = excluded.is_favorite,
  status = excluded.status,
  tags = excluded.tags;

insert into public.product_variants (id, product_id, name, sku, price, cost, is_default)
values
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Mediana', 'PIZ-PEP-M', 11990, 5100, false),
  ('bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Familiar', 'PIZ-PEP-F', 15990, 6700, true),
  ('bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Coca-Cola', 'BEB-COCA', 3490, 1200, true),
  ('bbbbbbb4-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Sprite', 'BEB-SPR', 3490, 1200, false)
on conflict (id) do update
set
  name = excluded.name,
  sku = excluded.sku,
  price = excluded.price,
  cost = excluded.cost,
  is_default = excluded.is_default;

insert into public.product_modifier_groups (id, product_id, name, min_select, max_select)
values
  ('ccccccc1-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Ajustes pizza', 0, 3),
  ('ccccccc2-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Ajustes sushi', 0, 3)
on conflict (id) do update
set
  name = excluded.name,
  min_select = excluded.min_select,
  max_select = excluded.max_select;

insert into public.product_modifiers (id, modifier_group_id, name, price_delta, default_included)
values
  ('ddddddd1-dddd-dddd-dddd-ddddddddddd1', 'ccccccc1-cccc-cccc-cccc-ccccccccccc1', 'Extra queso', 1500, false),
  ('ddddddd2-dddd-dddd-dddd-ddddddddddd2', 'ccccccc1-cccc-cccc-cccc-ccccccccccc1', 'Sin cebolla', 0, true),
  ('ddddddd3-dddd-dddd-dddd-ddddddddddd3', 'ccccccc2-cccc-cccc-cccc-ccccccccccc2', 'Salsa teriyaki aparte', 500, false),
  ('ddddddd4-dddd-dddd-dddd-ddddddddddd4', 'ccccccc2-cccc-cccc-cccc-ccccccccccc2', 'Sin cebollín', 0, true)
on conflict (id) do update
set
  name = excluded.name,
  price_delta = excluded.price_delta,
  default_included = excluded.default_included;

insert into public.promotions (name, description, type, value, is_active, rules)
values
  (
    'Promo almuerzo',
    '10% de descuento entre 13:00 y 15:00',
    'horario',
    10,
    true,
    '{"from":"13:00","to":"15:00","mode":"percentage"}'::jsonb
  )
on conflict do nothing;

-- Importante:
-- 1. Crea primero usuarios en Supabase Auth.
-- 2. Luego actualiza sus perfiles/roles en public.profiles.
-- 3. Para crear un administrador inicial:
--    update public.profiles set role = 'administrador' where email = 'tu-correo@dominio.cl';

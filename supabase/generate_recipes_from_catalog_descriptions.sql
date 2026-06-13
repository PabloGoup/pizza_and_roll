-- Genera un recetario operacional desde las descripciones del catálogo.
-- No representa gramajes ni costos: quantity = 1 significa "este producto usa
-- este ingrediente". Esto permite propagar agotados a web, POS y WhatsApp.
--
-- Es idempotente: vuelve a construir los recipe_items de los productos activos.
-- Las opciones excluyentes ("arroz o noodle", "salmón o pescado blanco",
-- "salsa a elección") no se agregan como obligatorias para evitar bloquear un
-- producto cuando todavía existe una alternativa disponible.

begin;

create temp table tmp_ingredient_rules (
  ingredient_name text primary key,
  pattern text not null
) on commit drop;

insert into tmp_ingredient_rules (ingredient_name, pattern) values
  ('Palta', '\mpalta\M'),
  ('Queso crema', '\mqueso crema\M'),
  ('Ciboulette', '\mciboulette\M'),
  ('Cebollín', '\mceboll[ií]n\M'),
  ('Carne de vacuno', '\mcarne\M'),
  ('Pollo', '\mpollo\M'),
  ('Camarón', '\mcamar[oó]n(?:es)?\M'),
  ('Kanikama', '\mkanikama\M'),
  ('Salmón', '\msalm[oó]n\M'),
  ('Pescado blanco', '\mpescado blanco\M'),
  ('Cangrejo', '\mcangrejo\M'),
  ('Pepino', '\mpepino\M'),
  ('Palmito', '\mpalmito\M'),
  ('Champiñón', '\mchampi[nñ][oó]n\M'),
  ('Pimentón', '\mpiment[oó]n\M'),
  ('Zanahoria', '\mzanahoria\M'),
  ('Cebolla morada', '\mcebolla morada\M'),
  ('Cancha', '\mcancha\M'),
  ('Choclo peruano', '\mchoclo peruano\M'),
  ('Lechuga', '\mlechuga\M'),
  ('Leche de tigre', '\mleche de tigre\M'),
  ('Sésamo', '\ms[eé]samo\M'),
  ('Nori', '\mnori\M'),
  ('Panko', '\mpanko\M'),
  ('Salsa acevichada', '\msalsa acevichada\M'),
  ('Salsa teriyaki', '\msalsa teriyaki\M'),
  ('Salsa huancaína', '\msalsa (?:a la )?huancaina\M'),
  ('Salsa spicy', '\msalsa spicy\M'),
  ('Salsa dinamita', '\msalsa dinamita\M'),
  ('Salsa fuji', '\msalsa fuji\M'),
  ('Ceviche mixto', '\mceviche mixto\M');

insert into public.ingredients (
  name,
  unit,
  current_stock,
  minimum_stock,
  average_cost
)
select
  ingredient_name,
  'unidad'::public.unit_code,
  0,
  0,
  0
from tmp_ingredient_rules
on conflict (name) do nothing;

insert into public.recipes (product_id)
select p.id
from public.products p
where p.status = 'activo'
on conflict (product_id) do nothing;

-- El script administra las relaciones cualitativas de los productos activos.
delete from public.recipe_items ri
using public.recipes r, public.products p
where ri.recipe_id = r.id
  and r.product_id = p.id
  and p.status = 'activo';

create temp table tmp_product_ingredients (
  product_id uuid not null,
  ingredient_name text not null,
  primary key (product_id, ingredient_name)
) on commit drop;

-- Ingredientes mencionados directamente en la descripción.
insert into tmp_product_ingredients (product_id, ingredient_name)
select p.id, rule.ingredient_name
from public.products p
cross join tmp_ingredient_rules rule
where p.status = 'activo'
  and lower(p.description) ~ rule.pattern
  -- Estas descripciones ofrecen alternativas, no ingredientes simultáneos.
  and not (
    p.name in ('Sashimi', 'Nigiris', 'Gyozas')
    and rule.ingredient_name in (
      'Salmón',
      'Pescado blanco',
      'Camarón',
      'Pollo'
    )
  )
on conflict do nothing;

-- "Queso" en la carta se usa como cobertura y corresponde a queso crema.
insert into tmp_product_ingredients (product_id, ingredient_name)
select p.id, 'Queso crema'
from public.products p
where p.status = 'activo'
  and lower(p.description) ~ '\mqueso\M'
on conflict do nothing;

-- Productos tempura/apanados/fritos dependen del insumo de apanado.
insert into tmp_product_ingredients (product_id, ingredient_name)
select p.id, 'Panko'
from public.products p
join public.product_categories c on c.id = p.category_id
where p.status = 'activo'
  and (
    lower(p.description) ~ '\m(apanad[oa]s?|tempurizad[oa]s?|frit[oa]s?|panko)\M'
    or c.name = 'Rolls Calientes'
    or p.name in ('Sake Furay', 'Tori Furay', 'Ebi Furay')
  )
on conflict do nothing;

-- Futomaki y hand rolls usan nori aunque algunas descripciones no lo repitan.
insert into tmp_product_ingredients (product_id, ingredient_name)
select p.id, 'Nori'
from public.products p
join public.product_categories c on c.id = p.category_id
where p.status = 'activo'
  and c.name in ('Futomaki', 'Hand Roll')
on conflict do nothing;

-- Los combos premium describen rolls completos; heredan sus ingredientes.
create temp table tmp_combo_components (
  combo_name text not null,
  component_name text not null
) on commit drop;

insert into tmp_combo_components (combo_name, component_name) values
  ('Promo 30 Piezas Premium', 'Acevichado Roll'),
  ('Promo 30 Piezas Premium', 'Sushi a la Huancaina'),
  ('Promo 30 Piezas Premium', 'Tori Fuji Roll'),
  ('Promo 50 Piezas Premium', 'Acevichado Roll'),
  ('Promo 50 Piezas Premium', 'Beef Roll'),
  ('Promo 50 Piezas Premium', 'Cangrejo Dinamita Roll'),
  ('Promo 50 Piezas Premium', 'Sake Ceviche Roll');

insert into tmp_product_ingredients (product_id, ingredient_name)
select combo.id, component_ingredient.ingredient_name
from tmp_combo_components mapping
join public.products combo
  on lower(combo.name) = lower(mapping.combo_name)
join public.products component
  on lower(component.name) = lower(mapping.component_name)
join tmp_product_ingredients component_ingredient
  on component_ingredient.product_id = component.id
where combo.status = 'activo'
  and component.status = 'activo'
on conflict do nothing;

insert into public.recipe_items (
  recipe_id,
  ingredient_id,
  quantity,
  unit_cost
)
select
  r.id,
  i.id,
  1,
  0
from tmp_product_ingredients mapping
join public.recipes r on r.product_id = mapping.product_id
join public.ingredients i on i.name = mapping.ingredient_name;

commit;

-- Auditoría recomendada después de ejecutar:
-- 1. Productos sin ingredientes (pueden ser promos configurables):
-- select c.name as category, p.name, p.description
-- from public.products p
-- join public.product_categories c on c.id = p.category_id
-- left join public.recipes r on r.product_id = p.id
-- left join public.recipe_items ri on ri.recipe_id = r.id
-- where p.status = 'activo'
-- group by c.name, p.name, p.description
-- having count(ri.id) = 0
-- order by c.name, p.name;
--
-- 2. Recetario generado:
-- select c.name as category, p.name as product,
--        string_agg(i.name, ', ' order by i.name) as ingredients
-- from public.products p
-- join public.product_categories c on c.id = p.category_id
-- join public.recipes r on r.product_id = p.id
-- join public.recipe_items ri on ri.recipe_id = r.id
-- join public.ingredients i on i.id = ri.ingredient_id
-- where p.status = 'activo'
-- group by c.name, p.name
-- order by c.name, p.name;

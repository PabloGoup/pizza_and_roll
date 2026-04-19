-- ATENCION:
-- Este script NO borra historial de ventas ni registros ya referenciados por pedidos.
-- Actualiza o inserta el catalogo de Poke and Roll de forma segura.
-- Si existen productos antiguos fuera de esta carta, quedaran en la base;
-- puedes desactivarlos manualmente despues si no los quieres vender.

begin;

create temp table tmp_categories (
  name text primary key,
  color text not null,
  sort_order integer not null
) on commit drop;

insert into tmp_categories (name, color, sort_order) values
  ('Futomaki', '#2563eb', 1),
  ('California', '#c026d3', 2),
  ('Avocados', '#16a34a', 3),
  ('Rolls Calientes', '#dc2626', 4),
  ('Sushis Premium', '#f59e0b', 5),
  ('Ceviches', '#06b6d4', 6),
  ('Promos Sushi', '#ef4444', 7),
  ('Promociones Rolls', '#0ea5e9', 8),
  ('Aperitivos', '#3b82f6', 9),
  ('Hand Roll', '#22c55e', 10),
  ('Sushi Sin Arroz', '#10b981', 11),
  ('Sushiburger', '#ef4444', 12),
  ('Poke Bowl', '#16a34a', 13),
  ('Promos Poke', '#ec4899', 14),
  ('Promos Ceviche', '#14b8a6', 15);

insert into public.product_categories (name, color, sort_order)
select name, color, sort_order
from tmp_categories
on conflict (name) do update
set
  color = excluded.color,
  sort_order = excluded.sort_order;

create temp table tmp_products (
  category_name text not null,
  name text not null,
  description text not null,
  base_price numeric(12, 2) not null,
  tags text[] not null default '{}',
  is_favorite boolean not null default false
) on commit drop;

insert into tmp_products (category_name, name, description, base_price, tags, is_favorite) values
  ('Sushis Premium', 'Acevichado Roll', 'Palta, queso crema, ciboulette, cubierto con salsa acevichada del día.', 5990, array['sushi','premium'], false),
  ('Sushis Premium', 'Beef Roll', 'Queso crema, cebollín, carne, cubierto con salsa teriyaki.', 5990, array['sushi','premium'], false),
  ('Sushis Premium', 'Sushi a la Huancaina', 'Pollo tempurizado, queso crema, bañado con salsa a la huancaina.', 5990, array['sushi','premium'], false),
  ('Sushis Premium', 'Ebi Spicy', 'Camarón, queso crema, cebollín, apanado en panko aderezado con salsa spicy.', 5900, array['sushi','premium'], false),
  ('Sushis Premium', 'Cangrejo Dinamita Roll', 'Mezcla de cangrejo con salsa dinamita, queso crema, cebollín, envuelto en palta.', 6490, array['sushi','premium'], false),
  ('Sushis Premium', 'Tori Fuji Roll', 'Pollo apanado, queso crema, pepino, envuelto en sésamo, con salsa fuji sopleteada.', 6490, array['sushi','premium'], false),
  ('Sushis Premium', 'Sake Ceviche Roll', 'Salmón, palta, cubierto con ceviche mixto del día.', 6990, array['sushi','premium'], false),

  ('Promos Sushi', 'Promo 30 Piezas Premium', 'Incluye 1 Acevichado Roll, 1 Sushi a la Huancaina y 1 Tori Fuji Roll.', 14990, array['promo','combo','sushi'], true),
  ('Promos Sushi', 'Promo 50 Piezas Premium', 'Incluye 2 Acevichado Roll, 1 Beef Roll, 1 Cangrejo Dinamita Roll y 1 Ceviche Roll.', 24990, array['promo','combo','sushi'], true),

  ('Ceviches', 'Ceviche Tradicional', 'Pescado blanco, cebolla morada, cancha, choclo peruano, lechuga y leche de tigre.', 5490, array['ceviche'], false),
  ('Ceviches', 'Ceviche Mixto', 'Pescado blanco, cebolla morada, cancha, choclo peruano, lechuga, palta, camarones y leche de tigre.', 6490, array['ceviche'], false),
  ('Ceviches', 'Ceviche Salmón', 'Salmón, cebolla morada, cancha, choclo peruano, lechuga y leche de tigre.', 6990, array['ceviche'], false),
  ('Ceviches', 'Ceviche Especial', 'Pescado blanco, salmón, camarones, cebolla morada, cancha, choclo peruano, lechuga, palta y leche de tigre.', 6990, array['ceviche'], false),

  ('Promos Ceviche', 'Promo 2 Ceviches 300gr', 'Lleva 2 ceviches de 300 gramos a elección.', 10990, array['promo','ceviche'], true),
  ('Promos Ceviche', 'Promo 2 Ceviches 500gr', 'Lleva 2 ceviches de 500 gramos a elección.', 15990, array['promo','ceviche'], true),

  ('Promociones Rolls', '20 Piezas Mixtas', 'Incluye 10 pollo, queso crema, cebollín envuelto en panko y 10 camarón, queso crema, cebollín envuelto en sésamo.', 7990, array['promo','rolls'], true),
  ('Promociones Rolls', '30 Piezas Fritas', 'Incluye 10 pollo queso crema cebollín, 10 camarón queso crema cebollín y 10 kanikama queso crema cebollín.', 10990, array['promo','rolls'], true),
  ('Promociones Rolls', '30 Piezas Mixtas', 'Incluye 10 pollo, palta, cebollín envuelto en queso; 10 palmito, queso crema, ciboulette envuelto en palta; 10 kanikama, queso crema, cebollín envuelto en panko.', 12500, array['promo','rolls'], true),
  ('Promociones Rolls', '40 Piezas Mixtas', 'Incluye 10 camarón queso cebollín envuelto en palta; 10 pollo queso cebollín fritos; 10 kanikama queso ciboulette fritos; 10 pepino queso palta envuelto en sésamo.', 13990, array['promo','rolls'], true),
  ('Promociones Rolls', '40 Piezas Fritas', 'Incluye salmón queso palta envuelto en panko, pollo queso cebollín envuelto en panko, champiñón queso cebollín envuelto en panko y camarón queso cebollín envuelto en panko.', 14500, array['promo','rolls'], true),
  ('Promociones Rolls', '50 Piezas Opción A', 'Incluye 10 kanikama queso ciboulette futomaki frito, 10 camarón queso cebollín fritos, 10 pollo queso cebollín fritos, 10 salmón queso cebollín envuelto en palta y 10 palmito queso palta envuelto en sésamo.', 15990, array['promo','rolls'], true),
  ('Promociones Rolls', '50 Piezas Opción B', 'Incluye pollo apanado envuelto en palta, camarón apanado envuelto en queso, salmón queso cebollín envuelto en panko, pollo queso cebollín en panko y kanikama queso cebollín en panko.', 17500, array['promo','rolls'], true),
  ('Promociones Rolls', '70 Piezas Mixtas', 'Incluye 10 camarón queso cebollín fritos, 10 pollo queso cebollín fritos, 10 kanikama queso ciboulette fritos, 10 salmón queso cebollín envuelto en palta, 10 palmito queso palta envuelto en queso, 10 pepino queso palta envuelto en sésamo y 10 pollo queso cebollín futomaki fritos.', 21990, array['promo','rolls'], true),
  ('Promociones Rolls', '80 Piezas Mixtas', 'Incluye 20 pollo apanado en panko, 20 camarón apanado en panko, salmón queso cebollín envuelto en sésamo, camarón queso palta envuelto en queso, pollo queso cebollín envuelto en palta, palmito queso palta envuelto en ciboulette y futomaki pollo queso.', 25000, array['promo','rolls'], true),
  ('Promociones Rolls', '100 Piezas Mixtas', 'Incluye 10 pollo queso cebollín en panko, 10 camarón queso cebollín en panko, 10 kanikama queso ciboulette en panko, 10 salmón queso cebollín en panko, 10 pollo queso crema palta en nori, 10 camarón queso cebollín envuelto en palta, 10 pepino queso cebollín envuelto en sésamo y 10 palmito queso cebollín envuelto en queso.', 34990, array['promo','rolls'], true),
  ('Promociones Rolls', '140 Piezas Mixtas', 'Incluye 20 pollo queso cebollín en panko, 20 camarón queso cebollín en panko, 20 kanikama queso ciboulette en panko, 10 salmón queso cebollín en panko, 10 champiñón queso cebollín en panko, 10 acevichado roll, 10 pollo queso crema palta en nori, 10 camarón queso cebollín envuelto en palta, 10 pepino queso cebollín envuelto en sésamo, 10 salmón queso ciboulette envuelto en palta y 10 palmito queso cebollín envuelto en queso.', 44990, array['promo','rolls'], true),
  ('Promociones Rolls', '200 Piezas Mixtas', 'Incluye 40 pollo queso cebollín en panko, 30 camarón queso cebollín en panko, 20 kanikama queso ciboulette en panko, 10 salmón queso cebollín en panko, 10 champiñón queso cebollín en panko, 20 pollo queso crema palta en nori, 10 camarón queso cebollín envuelto en palta, 10 pepino queso cebollín envuelto en sésamo, 10 salmón queso ciboulette envuelto en palta, 10 palmito queso cebollín envuelto en queso, 10 acevichado roll, 10 sushi a la huancaina y 10 beef roll.', 64990, array['promo','rolls'], true),

  ('Futomaki', 'Ebi Roll', 'Camarón, queso crema, cebollín. Envuelto en nori.', 4000, array['sushi','futomaki'], false),
  ('Futomaki', 'Tori Roll', 'Pollo, queso crema, cebollín. Envuelto en nori.', 4000, array['sushi','futomaki'], false),
  ('Futomaki', 'Sake Roll', 'Salmón, palta, queso crema. Envuelto en nori.', 4000, array['sushi','futomaki'], false),
  ('Futomaki', 'Pepino Roll', 'Pepino, queso crema, palta. Envuelto en nori.', 3800, array['sushi','futomaki'], false),
  ('Futomaki', 'Maki Roll', 'Kanikama, queso crema, ciboulette. Envuelto en nori.', 3800, array['sushi','futomaki'], false),
  ('Futomaki', 'Palmito Roll', 'Palmito, palta. Envuelto en nori.', 3800, array['sushi','futomaki'], false),

  ('California', 'Ebi Roll', 'Camarón, queso crema, cebollín. Envuelto en sésamo o ciboulette.', 4200, array['sushi','california'], false),
  ('California', 'Tori Tempura Roll', 'Pollo tempurizado, queso crema, cebollín. Envuelto en sésamo o ciboulette.', 4200, array['sushi','california'], false),
  ('California', 'Sake Roll', 'Salmón, palta, queso crema. Envuelto en sésamo o ciboulette.', 4200, array['sushi','california'], false),
  ('California', 'Pepino Roll', 'Pepino, queso crema, palta. Envuelto en sésamo o ciboulette.', 4000, array['sushi','california'], false),
  ('California', 'Maki Roll', 'Kanikama, queso crema, ciboulette. Envuelto en sésamo o ciboulette.', 4000, array['sushi','california'], false),
  ('California', 'Teriyaki Roll', 'Pollo teriyaki, palta, cebollín. Envuelto en sésamo o ciboulette.', 4500, array['sushi','california'], false),

  ('Avocados', 'Ebi Tempura Roll', 'Camarón apanado, queso crema, cebollín. Envuelto en palta o queso.', 4500, array['sushi','avocado'], false),
  ('Avocados', 'Tori Tempura Roll', 'Pollo tempurizado, queso crema, cebollín. Envuelto en palta o queso.', 4500, array['sushi','avocado'], false),
  ('Avocados', 'Sake Roll', 'Salmón, palta, queso crema. Envuelto en palta o queso.', 5000, array['sushi','avocado'], false),
  ('Avocados', 'Palmito Roll', 'Palmito, queso crema, palta. Envuelto en palta o queso.', 4200, array['sushi','avocado'], false),
  ('Avocados', 'Maki Roll', 'Kanikama, queso crema, ciboulette. Envuelto en palta o queso.', 4200, array['sushi','avocado'], false),
  ('Avocados', 'Teriyaki Roll', 'Pollo teriyaki, palta, cebollín. Envuelto en palta o queso.', 5000, array['sushi','avocado'], false),

  ('Rolls Calientes', 'Ebi Roll', 'Camarón, queso crema, cebollín.', 5000, array['sushi','caliente'], false),
  ('Rolls Calientes', 'Tori Roll', 'Pollo, queso crema, cebollín.', 5000, array['sushi','caliente'], false),
  ('Rolls Calientes', 'Sake Roll', 'Salmón, palta, queso crema.', 5500, array['sushi','caliente'], false),
  ('Rolls Calientes', 'Veggie Roll', 'Champiñón, queso crema, pimentón.', 4500, array['sushi','caliente'], false),
  ('Rolls Calientes', 'Maki Roll', 'Kanikama, queso crema, ciboulette.', 4500, array['sushi','caliente'], false),
  ('Rolls Calientes', 'Teriyaki Roll', 'Pollo teriyaki, queso crema, cebollín.', 5500, array['sushi','caliente'], false),

  ('Aperitivos', 'Sashimi', '5 cortes de salmón o de pescado blanco.', 5500, array['aperitivo'], false),
  ('Aperitivos', 'Nigiris', '1 unidad de arroz cubierta con salmón, camarón o pescado blanco.', 1000, array['aperitivo'], false),
  ('Aperitivos', 'Gyozas', '5 empanadas japonesas. Pueden ser de pollo, camarón, cerdo o vegetariana.', 3990, array['aperitivo'], false),
  ('Aperitivos', 'Sake Furay', '5 unidades de cortes de salmón apanado.', 5000, array['aperitivo'], false),
  ('Aperitivos', 'Tori Furay', '5 unidades de cortes de filete de pollo apanado.', 4500, array['aperitivo'], false),
  ('Aperitivos', 'Ebi Furay', '5 unidades de camarón apanado.', 4500, array['aperitivo'], false),

  ('Hand Roll', 'Hand Roll Ebi', 'Camarón, queso crema, cebollín.', 3500, array['handroll'], false),
  ('Hand Roll', 'Hand Roll Tori', 'Pollo, queso crema, cebollín.', 3000, array['handroll'], false),
  ('Hand Roll', 'Hand Roll Sake', 'Salmón, queso crema, cebollín.', 3500, array['handroll'], false),
  ('Hand Roll', 'Hand Roll Vegetariano', 'Champiñón, queso crema, cebollín.', 3000, array['handroll'], false),
  ('Hand Roll', 'Hand Roll Maki', 'Kanikama, queso crema, cebollín.', 3000, array['handroll'], false),

  ('Sushi Sin Arroz', 'Vegetariano', 'Pepino, champiñón, palta, queso crema, palmito y cebollín.', 5500, array['sin_arroz'], false),
  ('Sushi Sin Arroz', 'Ebi Sake', 'Camarón, salmón, queso crema, palta y cebollín.', 6000, array['sin_arroz'], false),
  ('Sushi Sin Arroz', 'Ebi Tori', 'Camarón, pollo, queso crema, palta y cebollín.', 6000, array['sin_arroz'], false),

  ('Sushiburger', 'Sushi Burger Pollo', 'Relleno de pollo apanado, palta, queso crema y cebollín.', 6490, array['sushiburger'], false),
  ('Sushiburger', 'Sushi Burger Camarón', 'Relleno de camarón apanado, palta, queso crema y cebollín.', 6990, array['sushiburger'], false),
  ('Sushiburger', 'Sushi Burger Salmón', 'Relleno de salmón, palta, queso crema y cebollín.', 7490, array['sushiburger'], false),

  ('Poke Bowl', 'Poke de Pollo', 'Base de arroz shari o noodle. Queso crema, pollo, palta, pepino, cebollín, sésamo y salsa a elección.', 6490, array['poke'], false),
  ('Poke Bowl', 'Poke de Pollo Apanado', 'Base de arroz shari o noodle. Queso crema, pollo apanado, palta, zanahoria, sésamo y salsa a elección.', 6990, array['poke'], false),
  ('Poke Bowl', 'Poke de Camarón', 'Base de arroz shari o noodle. Queso crema, camarón apanado, palta, pepino, sésamo y salsa a elección.', 6990, array['poke'], false),
  ('Poke Bowl', 'Poke de Salmón', 'Base de arroz shari o noodle. Queso crema, salmón, palta, pepino, sésamo y salsa a elección.', 6990, array['poke'], false),
  ('Poke Bowl', 'Poke de Veggie', 'Base de arroz shari o noodle. Palta, pepino, zanahoria, champiñón y sésamo, con salsa a elección.', 5990, array['poke','vegetariano'], false),
  ('Poke Bowl', 'Poke Cangrejo Teriyaki', 'Base de arroz shari o noodle. Cangrejo teriyaki, queso crema, palta, cebollín y salsa a elección.', 6490, array['poke'], false),
  ('Poke Bowl', 'Poke Camarón Apanado', 'Base de arroz shari o noodle. Pollo apanado, queso crema, palta y cebollín con salsa a elección.', 6990, array['poke'], false),

  ('Promos Poke', '2 Pokes a Elección', 'Promo de 2 pokes a elección.', 12990, array['promo','poke'], true),
  ('Promos Poke', '3 Pokes a Elección', 'Promo de 3 pokes a elección.', 18990, array['promo','poke'], true),
  ('Promos Poke', '5 Pokes a Elección', 'Promo de 5 pokes a elección.', 29990, array['promo','poke'], true);

do $$
declare
  r record;
  v_category_id uuid;
  v_product_id uuid;
begin
  for r in select * from tmp_products loop
    select id into v_category_id
    from public.product_categories
    where name = r.category_name;

    select id into v_product_id
    from public.products
    where category_id = v_category_id
      and lower(name) = lower(r.name)
    order by created_at
    limit 1;

    if v_product_id is null then
      insert into public.products (
        category_id,
        name,
        description,
        base_price,
        cost,
        is_favorite,
        status,
        tags
      )
      values (
        v_category_id,
        r.name,
        r.description,
        r.base_price,
        0,
        r.is_favorite,
        'activo',
        r.tags
      );
    else
      update public.products
      set
        description = r.description,
        base_price = r.base_price,
        is_favorite = r.is_favorite,
        status = 'activo',
        tags = r.tags,
        updated_at = timezone('utc', now())
      where id = v_product_id;
    end if;
  end loop;
end $$;

update public.products p
set
  status = 'inactivo',
  is_favorite = false,
  updated_at = timezone('utc', now())
where not exists (
  select 1
  from tmp_products t
  join public.product_categories c
    on c.name = t.category_name
  where c.id = p.category_id
    and lower(t.name) = lower(p.name)
);

create temp table tmp_variants (
  category_name text not null,
  product_name text not null,
  variant_name text not null,
  price numeric(12, 2) not null,
  cost numeric(12, 2) not null default 0,
  is_default boolean not null default false
) on commit drop;

insert into tmp_variants (category_name, product_name, variant_name, price, cost, is_default) values
  ('Ceviches', 'Ceviche Tradicional', '300 grs', 5490, 0, true),
  ('Ceviches', 'Ceviche Tradicional', '500 grs', 7490, 0, false),
  ('Ceviches', 'Ceviche Mixto', '300 grs', 6490, 0, true),
  ('Ceviches', 'Ceviche Mixto', '500 grs', 7990, 0, false),
  ('Ceviches', 'Ceviche Salmón', '300 grs', 6990, 0, true),
  ('Ceviches', 'Ceviche Salmón', '500 grs', 8990, 0, false),
  ('Ceviches', 'Ceviche Especial', '300 grs', 6990, 0, true),
  ('Ceviches', 'Ceviche Especial', '500 grs', 8990, 0, false);

do $$
declare
  r record;
  v_category_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
begin
  for r in select * from tmp_variants loop
    select c.id into v_category_id
    from public.product_categories c
    where c.name = r.category_name;

    select p.id into v_product_id
    from public.products p
    where p.category_id = v_category_id
      and lower(p.name) = lower(r.product_name)
    limit 1;

    if v_product_id is null then
      raise exception 'No existe producto para variante: % / %', r.category_name, r.product_name;
    end if;

    select id into v_variant_id
    from public.product_variants
    where product_id = v_product_id
      and lower(name) = lower(r.variant_name)
    limit 1;

    if v_variant_id is null then
      insert into public.product_variants (
        product_id,
        name,
        sku,
        price,
        cost,
        is_default
      )
      values (
        v_product_id,
        r.variant_name,
        upper(replace(r.product_name, ' ', '-')) || '-' || upper(replace(r.variant_name, ' ', '')),
        r.price,
        r.cost,
        r.is_default
      );
    else
      update public.product_variants
      set
        price = r.price,
        cost = r.cost,
        is_default = r.is_default
      where id = v_variant_id;
    end if;
  end loop;
end $$;

create temp table tmp_poke_modifiers (
  product_name text not null,
  modifier_name text not null,
  price_delta numeric(12, 2) not null
) on commit drop;

insert into tmp_poke_modifiers (product_name, modifier_name, price_delta) values
  ('Poke de Pollo', 'Salsa adicional', 500),
  ('Poke de Pollo', 'Vegetal adicional', 1000),
  ('Poke de Pollo', 'Proteína adicional', 1500),
  ('Poke de Pollo Apanado', 'Salsa adicional', 500),
  ('Poke de Pollo Apanado', 'Vegetal adicional', 1000),
  ('Poke de Pollo Apanado', 'Proteína adicional', 1500),
  ('Poke de Camarón', 'Salsa adicional', 500),
  ('Poke de Camarón', 'Vegetal adicional', 1000),
  ('Poke de Camarón', 'Proteína adicional', 1500),
  ('Poke de Salmón', 'Salsa adicional', 500),
  ('Poke de Salmón', 'Vegetal adicional', 1000),
  ('Poke de Salmón', 'Proteína adicional', 1500),
  ('Poke de Veggie', 'Salsa adicional', 500),
  ('Poke de Veggie', 'Vegetal adicional', 1000),
  ('Poke de Veggie', 'Proteína adicional', 1500),
  ('Poke Cangrejo Teriyaki', 'Salsa adicional', 500),
  ('Poke Cangrejo Teriyaki', 'Vegetal adicional', 1000),
  ('Poke Cangrejo Teriyaki', 'Proteína adicional', 1500),
  ('Poke Camarón Apanado', 'Salsa adicional', 500),
  ('Poke Camarón Apanado', 'Vegetal adicional', 1000),
  ('Poke Camarón Apanado', 'Proteína adicional', 1500);

do $$
declare
  r record;
  v_category_id uuid;
  v_product_id uuid;
  v_group_id uuid;
  v_modifier_id uuid;
begin
  for r in select * from tmp_poke_modifiers loop
    select id into v_category_id
    from public.product_categories
    where name = 'Poke Bowl';

    select id into v_product_id
    from public.products
    where category_id = v_category_id
      and lower(name) = lower(r.product_name)
    limit 1;

    if v_product_id is null then
      raise exception 'No existe producto para modificador poke: %', r.product_name;
    end if;

    select id into v_group_id
    from public.product_modifier_groups
    where product_id = v_product_id
      and lower(name) = lower('Adicionales Poke')
    limit 1;

    if v_group_id is null then
      insert into public.product_modifier_groups (
        product_id,
        name,
        min_select,
        max_select
      )
      values (
        v_product_id,
        'Adicionales Poke',
        0,
        3
      )
      returning id into v_group_id;
    end if;

    select id into v_modifier_id
    from public.product_modifiers
    where modifier_group_id = v_group_id
      and lower(name) = lower(r.modifier_name)
    limit 1;

    if v_modifier_id is null then
      insert into public.product_modifiers (
        modifier_group_id,
        name,
        price_delta,
        default_included
      )
      values (
        v_group_id,
        r.modifier_name,
        r.price_delta,
        false
      );
    else
      update public.product_modifiers
      set
        price_delta = r.price_delta,
        default_included = false
      where id = v_modifier_id;
    end if;
  end loop;
end $$;

commit;

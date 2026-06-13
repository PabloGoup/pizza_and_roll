alter table public.products
  add column if not exists is_sold_out boolean not null default false;

alter table public.ingredients
  add column if not exists is_sold_out boolean not null default false;

create or replace function public.is_operational_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
      and role in ('administrador', 'cajero')
  )
$$;

create or replace function public.set_product_sold_out(p_product_id uuid, p_is_sold_out boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operational_staff() then
    raise exception 'No tienes permisos para cambiar la disponibilidad.';
  end if;
  update public.products
  set is_sold_out = p_is_sold_out, updated_at = now()
  where id = p_product_id;
  if not found then raise exception 'Producto no encontrado.'; end if;
end;
$$;

create or replace function public.set_ingredient_sold_out(p_ingredient_id uuid, p_is_sold_out boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operational_staff() then
    raise exception 'No tienes permisos para cambiar la disponibilidad.';
  end if;
  update public.ingredients
  set is_sold_out = p_is_sold_out, updated_at = now()
  where id = p_ingredient_id;
  if not found then raise exception 'Ingrediente no encontrado.'; end if;
end;
$$;

create or replace function public.get_storefront_availability()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'productId', p.id,
      'isSoldOut', p.is_sold_out,
      'unavailableIngredients', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) order by i.name)
        from public.recipes r
        join public.recipe_items ri on ri.recipe_id = r.id
        join public.ingredients i on i.id = ri.ingredient_id
        where r.product_id = p.id and i.is_sold_out
      ), '[]'::jsonb)
    ) order by p.name
  ), '[]'::jsonb)
  from public.products p
  where p.status = 'activo'
$$;

create or replace function public.get_operational_availability()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_operational_staff() then
    raise exception 'No tienes permisos para consultar la disponibilidad operativa.';
  end if;
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'categoryName', pc.name, 'isSoldOut', p.is_sold_out
      ) order by pc.sort_order, p.name)
      from public.products p
      join public.product_categories pc on pc.id = p.category_id
      where p.status = 'activo'
    ), '[]'::jsonb),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'unit', i.unit, 'isSoldOut', i.is_sold_out,
        'affectedProducts', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
          from public.recipe_items ri
          join public.recipes r on r.id = ri.recipe_id
          join public.products p on p.id = r.product_id
          where ri.ingredient_id = i.id and p.status = 'activo'
        ), '[]'::jsonb)
      ) order by i.name)
      from public.ingredients i
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.validate_order_item_availability()
returns trigger language plpgsql set search_path = public as $$
declare
  product_name text;
  sold_out boolean;
  unavailable_names text;
begin
  select name, is_sold_out into product_name, sold_out
  from public.products where id = new.product_id;
  if coalesce(sold_out, false) then
    raise exception 'El producto "%" está agotado.', product_name;
  end if;
  select string_agg(i.name, ', ' order by i.name) into unavailable_names
  from public.recipes r
  join public.recipe_items ri on ri.recipe_id = r.id
  join public.ingredients i on i.id = ri.ingredient_id
  where r.product_id = new.product_id and i.is_sold_out;
  if unavailable_names is not null then
    raise exception 'El producto "%" no está disponible por ingrediente agotado: %.',
      product_name, unavailable_names;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_order_item_availability_trigger on public.order_items;
create trigger validate_order_item_availability_trigger
before insert or update of product_id on public.order_items
for each row execute function public.validate_order_item_availability();

grant execute on function public.get_storefront_availability() to anon, authenticated;
grant execute on function public.get_operational_availability() to authenticated;
grant execute on function public.set_product_sold_out(uuid, boolean) to authenticated;
grant execute on function public.set_ingredient_sold_out(uuid, boolean) to authenticated;

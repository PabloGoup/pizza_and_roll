-- Un producto agotado sigue bloqueado. Un ingrediente agotado puede sustituirse
-- siempre que la nota del item registre explícitamente el cambio.

create or replace function public.validate_order_item_availability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  product_name text;
  sold_out boolean;
  missing_ingredient record;
begin
  select name, is_sold_out
  into product_name, sold_out
  from public.products
  where id = new.product_id;

  if coalesce(sold_out, false) then
    raise exception 'El producto "%" está agotado.', product_name;
  end if;

  for missing_ingredient in
    select i.name
    from public.recipes r
    join public.recipe_items ri on ri.recipe_id = r.id
    join public.ingredients i on i.id = ri.ingredient_id
    where r.product_id = new.product_id
      and i.is_sold_out
  loop
    if coalesce(new.notes, '') not ilike
      '%Cambio por agotado: ' || missing_ingredient.name || ' -> %'
    then
      raise exception
        'El producto "%" requiere indicar un reemplazo para el ingrediente agotado: %.',
        product_name,
        missing_ingredient.name;
    end if;
  end loop;

  return new;
end;
$$;

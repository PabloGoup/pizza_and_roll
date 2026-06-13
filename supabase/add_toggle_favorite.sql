-- Permite que el personal activo (administrador o cajero) marque/desmarque
-- productos como favoritos desde el POS, SIN darles permiso para editar el
-- resto del producto (precios, etc.). Función SECURITY DEFINER acotada a
-- una sola columna.

create or replace function public.set_product_favorite(
  p_product_id uuid,
  p_is_favorite boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role in ('administrador', 'cajero')
  ) then
    raise exception 'No autorizado para cambiar favoritos.';
  end if;

  update public.products
  set is_favorite = p_is_favorite
  where id = p_product_id;
end;
$$;

grant execute on function public.set_product_favorite(uuid, boolean) to authenticated;

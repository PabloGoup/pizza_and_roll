-- One ordering for the POS selector and the database default, including accents.
create or replace function public.list_delivery_drivers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_staff() then raise exception 'Sin permiso para asignar repartidores'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'full_name', full_name)
    order by translate(lower(full_name),'áéíóúüñ','aeiouun'), id)
    from public.profiles where role::text = 'repartidor' and is_active), '[]'::jsonb);
end;
$$;

create or replace function public.default_delivery_driver()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.assigned_driver_id is null then
    select id into new.assigned_driver_id from public.profiles
      where role::text = 'repartidor' and is_active
      order by translate(lower(full_name),'áéíóúüñ','aeiouun'), id limit 1;
  end if;
  if new.assigned_driver_id is not null and (tg_op = 'INSERT' or new.assigned_driver_id is distinct from old.assigned_driver_id) then
    perform 1 from public.profiles where id = new.assigned_driver_id
      and role::text = 'repartidor' and is_active for share;
    if not found then raise exception 'Repartidor no disponible'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.default_delivery_driver() from public, anon, authenticated;
drop trigger if exists dispatch_default_driver on public.dispatch_orders;
create trigger dispatch_default_driver before insert or update of assigned_driver_id on public.dispatch_orders
for each row execute function public.default_delivery_driver();
notify pgrst, 'reload schema';

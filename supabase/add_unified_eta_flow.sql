-- ETA unificado para storefront, bot y cocina.
-- Ejecutar despues de security_fixes.sql y add_cancel_storefront_order.sql.

create or replace function public.get_storefront_eta(
  p_order_type public.order_type default 'retiro_local',
  p_district text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_base integer := 20;
  v_delivery_base integer := 35;
  v_per_pending integer := 3;
  v_high_load_threshold integer := 5;
  v_pending_orders integer := 0;
  v_base_minutes integer := 20;
  v_computed_minutes integer := 20;
  v_zone public.delivery_zones%rowtype;
  v_estimated_ready_at timestamptz;
begin
  select
    coalesce(max(s.pickup_base_minutes), 20),
    coalesce(max(s.delivery_base_minutes), 35),
    coalesce(max(s.per_pending_order_minutes), 3),
    coalesce(max(s.high_load_threshold), 5)
  into
    v_pickup_base,
    v_delivery_base,
    v_per_pending,
    v_high_load_threshold
  from public.store_settings s;

  if p_order_type = 'despacho' then
    if nullif(trim(coalesce(p_district, '')), '') is not null then
      select *
      into v_zone
      from public.delivery_zones
      where is_active = true
        and lower(district) = lower(trim(p_district))
      order by sort_order asc, name asc
      limit 1;
    end if;

    v_base_minutes := greatest(
      coalesce(v_zone.base_minutes, v_delivery_base),
      0
    );
  else
    v_base_minutes := greatest(v_pickup_base, 0);
  end if;

  select count(*)
  into v_pending_orders
  from public.orders o
  where o.status in ('pendiente', 'en_preparacion')
    and o.created_at >= now() - interval '12 hours';

  v_computed_minutes :=
    v_base_minutes + (v_pending_orders * greatest(v_per_pending, 0));
  v_estimated_ready_at := now() + make_interval(mins => v_computed_minutes);

  return jsonb_build_object(
    'orderType', p_order_type,
    'district', nullif(trim(coalesce(p_district, '')), ''),
    'baseMinutes', v_base_minutes,
    'pendingOrders', v_pending_orders,
    'perPendingOrderMinutes', v_per_pending,
    'estimatedMinutes', v_computed_minutes,
    'estimatedReadyAt', v_estimated_ready_at,
    'loadLevel', case
      when v_pending_orders >= v_high_load_threshold then 'high'
      when v_pending_orders > 0 then 'normal'
      else 'low'
    end
  );
end;
$$;

grant execute on function public.get_storefront_eta(public.order_type, text)
to anon, authenticated;

create or replace function public.start_kitchen_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'cajero', 'cocina')
  ) then
    raise exception 'No autorizado para operar cocina.';
  end if;

  update public.kitchen_tickets
  set status = 'en_preparacion'
  where id = p_ticket_id
    and status = 'pendiente'
  returning order_id into v_order_id;

  if v_order_id is null then
    raise exception 'Ticket no encontrado o no esta pendiente.';
  end if;

  update public.orders
  set status = 'en_preparacion'
  where id = v_order_id
    and status = 'pendiente';
end;
$$;

create or replace function public.complete_kitchen_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'cajero', 'cocina')
  ) then
    raise exception 'No autorizado para operar cocina.';
  end if;

  update public.kitchen_tickets
  set status = 'listo'
  where id = p_ticket_id
    and status in ('pendiente', 'en_preparacion')
  returning order_id into v_order_id;

  if v_order_id is null then
    raise exception 'Ticket no encontrado o ya finalizado.';
  end if;

  update public.orders
  set status = 'listo'
  where id = v_order_id
    and status in ('pendiente', 'en_preparacion');
end;
$$;

grant execute on function public.start_kitchen_ticket(uuid) to authenticated;
grant execute on function public.complete_kitchen_ticket(uuid) to authenticated;

-- La consulta del bot ahora expone tambien el estado real de cocina.
create or replace function public.get_storefront_order_status(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden record;
begin
  select
    o.id,
    o.number,
    o.status,
    o.type,
    o.estimated_ready_at,
    kt.status as kitchen_status
  into v_orden
  from public.orders o
  left join public.kitchen_tickets kt on kt.order_id = o.id
  where o.id = p_order_id;

  if v_orden.id is null then
    return jsonb_build_object('ok', false, 'error', 'orden_no_encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_orden.id,
    'number', v_orden.number,
    'status', v_orden.status,
    'kitchen_status', v_orden.kitchen_status,
    'type', v_orden.type,
    'estimated_ready_at', v_orden.estimated_ready_at
  );
end;
$$;

grant execute on function public.get_storefront_order_status(uuid)
to anon, authenticated;

-- Archive the accumulated delivery queue at the user's requested reset cutoff.
-- Preserve sales, payment records and original fulfillment statuses.
alter table public.dispatch_orders
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

create or replace function public.list_delivery_orders()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null or actor.role::text not in ('administrador','cajero','repartidor') then
    raise exception 'Sin permiso para consultar reparto';
  end if;
  return coalesce((select jsonb_agg(row_to_json(r) order by r.created_at) from (
    select o.id, o.number, o.status, o.total, o.created_at,
      coalesce(o.customer_name_snapshot, d.contact_name, c.full_name) as customer_name,
      coalesce(o.customer_phone_snapshot, d.contact_phone, c.phone) as phone,
      concat_ws(', ', a.street, a.district, nullif(a.reference,'')) as address,
      d.assigned_driver_id, d.delivered_at
    from public.orders o
    join public.dispatch_orders d on d.order_id = o.id
    left join public.customers c on c.id = o.customer_id
    left join public.customer_addresses a on a.id = o.delivery_address_id
    where o.type = 'despacho' and o.status not in ('cancelado','entregado')
      and d.status <> 'cancelado' and d.archived_at is null
      and (actor.role::text in ('administrador','cajero') or d.assigned_driver_id = actor.id)
  ) r), '[]'::jsonb);
end;
$$;

create or replace function public.assign_delivery_driver(p_order_id uuid, p_driver_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target public.orders;
begin
  if not public.is_active_staff() then raise exception 'Sin permiso para asignar repartidores'; end if;
  select * into target from public.orders where id = p_order_id for update;
  if target.id is null or target.type <> 'despacho' or target.status in ('cancelado','entregado') then
    raise exception 'El pedido ya no admite asignaciones';
  end if;
  if p_driver_id is not null then
    perform 1 from public.profiles where id = p_driver_id and role::text = 'repartidor' and is_active for share;
    if not found then raise exception 'Repartidor no disponible'; end if;
  end if;
  update public.dispatch_orders set assigned_driver_id = p_driver_id where order_id = p_order_id and archived_at is null;
  if not found then raise exception 'No existe el despacho'; end if;
  insert into public.audit_logs(module, action, detail, performed_by, new_value)
    values ('ventas','asignar_repartidor','Asignación de reparto ' || target.number,auth.uid(),jsonb_build_object('order_id',p_order_id,'driver_id',p_driver_id));
end;
$$;

create or replace function public.complete_delivery(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target public.orders; dispatch public.dispatch_orders; session_id uuid; cash_amount numeric;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role::text = 'repartidor' and is_active) then
    raise exception 'Solo el repartidor asignado puede confirmar la entrega';
  end if;
  select * into target from public.orders where id = p_order_id for update;
  select * into dispatch from public.dispatch_orders where order_id = p_order_id for update;
  if dispatch.assigned_driver_id is distinct from auth.uid() or target.type <> 'despacho' then
    raise exception 'El pedido no está asignado a este repartidor';
  end if;
  if dispatch.archived_at is not null then raise exception 'El pedido está archivado y no admite entrega'; end if;
  if target.status = 'entregado' and dispatch.status = 'entregado' then return; end if;
  if target.status <> 'listo' or dispatch.status = 'cancelado' then
    raise exception 'El pedido aún no está listo para entrega';
  end if;
  -- Match the POS collection rule for previously uncollected web/WhatsApp cash.
  -- Lock the drawer and update its balance in the same transaction as delivery.
  if target.source in ('web','whatsapp') then
    select coalesce(sum(amount),0) into cash_amount from public.order_payments
      where order_id = p_order_id and method = 'efectivo';
    if cash_amount > 0 then
      select id into session_id from public.cash_sessions where status = 'abierta'
        order by opened_at desc limit 1 for update;
      if session_id is null then raise exception 'Caja debe estar abierta para registrar el cobro en efectivo'; end if;
      if not exists(select 1 from public.cash_movements where linked_order_id = p_order_id and type = 'ingreso') then
        insert into public.cash_movements(session_id,type,amount,reason,performed_by,linked_order_id)
          values(session_id,'ingreso',cash_amount,'Cobro efectivo ' || target.number || ' (entrega)',auth.uid(),p_order_id);
        update public.cash_sessions set expected_amount = expected_amount + cash_amount where id = session_id;
      end if;
    end if;
  end if;
  update public.orders set status = 'entregado' where id = p_order_id;
  update public.dispatch_orders set status = 'entregado', delivered_at = now() where order_id = p_order_id;
  update public.kitchen_tickets set status = 'entregado' where order_id = p_order_id;
  insert into public.audit_logs(module, action, detail, performed_by, new_value)
    values ('ventas','entregar_reparto','Entrega de pedido ' || target.number,auth.uid(),jsonb_build_object('order_id',p_order_id));
end;
$$;

do $$
declare item record; count_archived integer := 0;
begin
  for item in
    select d.id, d.order_id, d.assigned_driver_id, d.status as dispatch_status, o.number, o.status as order_status
    from public.dispatch_orders d join public.orders o on o.id = d.order_id
    where o.type = 'despacho' and o.status in ('pendiente','en_preparacion','listo')
      and d.status not in ('entregado','cancelado') and d.archived_at is null
      and o.created_at <= timestamptz '2026-10-22 23:28:28+00'
    for update of o, d
  loop
    update public.dispatch_orders set archived_at = now(),
      archive_reason = 'Reinicio de cola de reparto solicitado por el administrador el 22-10-2026'
      where id = item.id;
    insert into public.audit_logs(module,action,detail,previous_value,new_value,reason)
      values ('ventas','archivar_reparto','Archivo de reparto acumulado ' || item.number,
        jsonb_build_object('order_id',item.order_id,'driver_id',item.assigned_driver_id,'order_status',item.order_status,'dispatch_status',item.dispatch_status),
        jsonb_build_object('archived',true,'cutoff','2026-10-22T23:28:28Z'),
        'Solicitud del administrador en sesión de mantenimiento; sin entrega ni cobro');
    count_archived := count_archived + 1;
  end loop;
  raise notice 'Pedidos de reparto archivados: %', count_archived;
end;
$$;
notify pgrst, 'reload schema';

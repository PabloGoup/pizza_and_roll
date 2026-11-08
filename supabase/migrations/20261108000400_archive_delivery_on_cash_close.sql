begin;

create or replace function public.archive_delivery_on_cash_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := coalesce(new.closed_at, statement_timestamp());
  archived_ids jsonb;
  archived_count integer;
begin
  if old.status <> 'abierta' or new.status <> 'cerrada' then
    return new;
  end if;

  with archived as (
    update public.dispatch_orders d
    set archived_at = cutoff,
        archive_reason = 'Cierre de caja ' || new.id::text
    from public.orders o
    where o.id = d.order_id
      and o.type = 'despacho'
      and o.created_at <= cutoff
      and o.status not in ('entregado', 'cancelado')
      and d.status not in ('entregado', 'cancelado')
      and d.archived_at is null
    returning d.order_id
  )
  select count(*), coalesce(jsonb_agg(order_id), '[]'::jsonb)
  into archived_count, archived_ids
  from archived;

  if archived_count > 0 then
    insert into public.audit_logs (
      module, action, detail, performed_by, new_value
    ) values (
      'ventas', 'archivar_reparto_cierre_caja',
      'Cierre operativo de ' || archived_count || ' pedidos de reparto por cierre de caja',
      auth.uid(),
      jsonb_build_object(
        'cash_session_id', new.id,
        'cutoff', cutoff,
        'archived_count', archived_count,
        'order_ids', archived_ids
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.archive_delivery_on_cash_close() from public, anon, authenticated;

drop trigger if exists cash_session_archive_delivery on public.cash_sessions;
create trigger cash_session_archive_delivery
  after update of status on public.cash_sessions
  for each row execute function public.archive_delivery_on_cash_close();

-- Match the close path's session -> dispatch lock order to avoid a deadlock
-- between a cash close and a driver confirming a cash collection.
create or replace function public.complete_delivery(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.orders%rowtype;
  dispatch public.dispatch_orders%rowtype;
  session_id uuid;
  cash_amount numeric;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text = 'repartidor' and is_active
  ) then
    raise exception 'Solo el repartidor asignado puede confirmar la entrega';
  end if;

  select id into session_id
  from public.cash_sessions
  where status = 'abierta'
  order by opened_at desc
  limit 1
  for update;

  select * into target from public.orders where id = p_order_id for update;
  select * into dispatch from public.dispatch_orders where order_id = p_order_id for update;
  if dispatch.assigned_driver_id is distinct from auth.uid() or target.type <> 'despacho' then
    raise exception 'El pedido no está asignado a este repartidor';
  end if;
  if dispatch.archived_at is not null then
    raise exception 'El pedido está cerrado por caja y no admite entrega';
  end if;
  if target.status = 'entregado' and dispatch.status = 'entregado' then return; end if;
  if target.status <> 'listo' or dispatch.status = 'cancelado' then
    raise exception 'El pedido aún no está listo para entrega';
  end if;

  if target.source in ('web', 'whatsapp') then
    select coalesce(sum(amount), 0) into cash_amount
    from public.order_payments
    where order_id = p_order_id and method = 'efectivo';

    if cash_amount > 0 then
      if session_id is null then
        raise exception 'Caja debe estar abierta para registrar el cobro en efectivo';
      end if;
      if not exists (
        select 1 from public.cash_movements
        where linked_order_id = p_order_id and type = 'ingreso'
      ) then
        insert into public.cash_movements (
          session_id, type, amount, reason, performed_by, linked_order_id
        ) values (
          session_id, 'ingreso', cash_amount,
          'Cobro efectivo ' || target.number || ' (entrega)', auth.uid(), p_order_id
        );
        update public.cash_sessions
        set expected_amount = expected_amount + cash_amount
        where id = session_id;
      end if;
    end if;
  end if;

  update public.orders set status = 'entregado' where id = p_order_id;
  update public.dispatch_orders set status = 'entregado', delivered_at = now() where order_id = p_order_id;
  update public.kitchen_tickets set status = 'entregado' where order_id = p_order_id;
  insert into public.audit_logs (module, action, detail, performed_by, new_value)
  values ('ventas', 'entregar_reparto', 'Entrega de pedido ' || target.number,
    auth.uid(), jsonb_build_object('order_id', p_order_id));
end;
$$;

create or replace function public.update_pos_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_order public.orders%rowtype;
  saved_order public.orders%rowtype;
  session_id uuid;
  cash_amount numeric;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active
      and role::text in ('administrador', 'cajero')
  ) then
    raise exception 'No tienes permiso para actualizar pedidos desde caja';
  end if;

  if p_status is null or p_status not in ('pendiente', 'listo', 'entregado') then
    raise exception 'Estado de pedido no permitido';
  end if;

  -- All delivery/collection paths lock the cash session before the order.
  if p_status = 'entregado' then
    select id into session_id
    from public.cash_sessions
    where status = 'abierta'
    order by opened_at desc
    limit 1
    for update;
  end if;

  select * into previous_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'No se encontró la venta a actualizar';
  end if;
  if previous_order.status = 'cancelado' then
    raise exception 'No puedes cambiar el estado de una venta anulada';
  end if;
  if previous_order.status = p_status then
    return jsonb_build_object(
      'id', previous_order.id,
      'status', previous_order.status,
      'updatedAt', previous_order.updated_at
    );
  end if;

  -- POS cash is collected at checkout. Web/WhatsApp cash enters on delivery.
  if p_status = 'entregado' and previous_order.source in ('web', 'whatsapp') then
    select coalesce(sum(amount), 0) into cash_amount
    from public.order_payments
    where order_id = p_order_id and method = 'efectivo';

    if cash_amount > 0 and not exists (
      select 1 from public.cash_movements
      where linked_order_id = p_order_id and type = 'ingreso'
    ) then
      if session_id is null then
        raise exception 'Caja debe estar abierta para registrar el cobro en efectivo';
      end if;

      insert into public.cash_movements (
        session_id, type, amount, reason, performed_by, linked_order_id
      ) values (
        session_id, 'ingreso', cash_amount,
        'Cobro efectivo ' || previous_order.number || ' (entrega)',
        auth.uid(), p_order_id
      );
      update public.cash_sessions
      set expected_amount = expected_amount + cash_amount
      where id = session_id;
    end if;
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id
  returning * into saved_order;

  update public.kitchen_tickets
  set status = p_status
  where order_id = p_order_id and status is distinct from p_status;

  insert into public.audit_logs (
    module, action, detail, performed_by, previous_value, new_value
  ) values (
    'ventas', 'actualizar_estado',
    'Cambio de estado de ' || saved_order.number || ' a ' || p_status::text,
    auth.uid(), to_jsonb(previous_order), to_jsonb(saved_order)
  );

  return jsonb_build_object(
    'id', saved_order.id,
    'status', saved_order.status,
    'updatedAt', saved_order.updated_at
  );
end;
$$;

notify pgrst, 'reload schema';
commit;

-- Commit the status, kitchen state, collection and audit in one request.
begin;

create index if not exists cash_movements_order_income_idx
  on public.cash_movements (linked_order_id)
  where type = 'ingreso';

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

  -- The same order lock also serializes this operation with delivery confirmation.
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
      select id into session_id
      from public.cash_sessions
      where status = 'abierta'
      order by opened_at desc
      limit 1
      for update;

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

revoke all on function public.update_pos_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.update_pos_order_status(uuid, public.order_status) to authenticated;

notify pgrst, 'reload schema';
commit;

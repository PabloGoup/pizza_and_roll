-- Atomic quick edit: preserve products and customer details; synchronize settlement.
create or replace function public.update_order_fulfillment(
  p_order_id uuid,
  p_type public.order_type,
  p_delivery_fee numeric,
  p_expected_updated_at timestamptz
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  sale public.orders%rowtype;
  session public.cash_sessions%rowtype;
  fee numeric;
  delta numeric;
  next_total numeric;
  collected boolean;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()
    and is_active and role in ('administrador', 'cajero')) then
    raise exception 'No tienes permiso para editar ventas.';
  end if;
  select * into session from public.cash_sessions where status = 'abierta'
    order by opened_at desc limit 1 for update;
  if not found then raise exception 'Debes tener una caja abierta.'; end if;
  select * into sale from public.orders where id = p_order_id for update;
  if not found then raise exception 'No se encontró el pedido.'; end if;
  if sale.status = 'cancelado' then raise exception 'No puedes editar una venta anulada.'; end if;
  if sale.created_at < session.opened_at then raise exception 'La venta no pertenece al turno abierto.'; end if;
  if sale.updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido cambió. Actualiza las ventas y vuelve a intentarlo.';
  end if;
  if p_type is null then raise exception 'Selecciona el tipo de consumo.'; end if;
  if p_type = 'despacho' and (p_delivery_fee is null or p_delivery_fee < 2000 or p_delivery_fee = 'NaN'::numeric) then
    raise exception 'La tarifa mínima de despacho es $2.000.';
  end if;
  fee := case when p_type = 'despacho' then p_delivery_fee else 0 end;
  delta := fee - sale.delivery_fee;
  next_total := sale.total + delta;
  if next_total < 0 then raise exception 'El total no puede ser negativo.'; end if;
  if sale.type = p_type and delta = 0 then return; end if;
  if sale.payment_method = 'mixto' and delta <> 0 then
    raise exception 'Distribuye el nuevo total entre los medios de pago en Editar.';
  end if;

  update public.orders set type = p_type, delivery_fee = fee,
    subtotal = subtotal + delta, total = next_total, updated_at = now()
    where id = p_order_id;
  if delta <> 0 then
    delete from public.order_payments where order_id = p_order_id;
    insert into public.order_payments(order_id, method, amount)
      values(p_order_id, sale.payment_method, next_total);
  end if;

  if p_type = 'despacho' then
    insert into public.dispatch_orders(order_id, status, contact_name, contact_phone, delivery_fee)
    values(p_order_id,
      case when sale.status = 'entregado' then 'entregado'::public.dispatch_status
        when sale.status = 'en_preparacion' then 'en_preparacion'::public.dispatch_status
        else 'pendiente'::public.dispatch_status end,
      sale.customer_name_snapshot, sale.customer_phone_snapshot, fee)
    on conflict (order_id) do update set delivery_fee = excluded.delivery_fee,
      status = case when dispatch_orders.status = 'cancelado' then excluded.status else dispatch_orders.status end;
  elsif sale.type = 'despacho' then
    update public.dispatch_orders set status = 'cancelado', delivery_fee = 0 where order_id = p_order_id;
  end if;

  collected := sale.source = 'pos' or sale.status = 'entregado';
  if delta <> 0 and sale.payment_method = 'efectivo' and collected then
    insert into public.cash_movements(session_id, type, amount, reason, performed_by, linked_order_id)
      values(session.id, case when delta > 0 then 'ingreso'::public.cash_movement_type else 'anulacion'::public.cash_movement_type end,
        abs(delta), 'Cambio de despacho ' || sale.number, auth.uid(), sale.id);
    update public.cash_sessions set expected_amount = expected_amount + delta where id = session.id;
  end if;
  insert into public.audit_logs(module, action, detail, performed_by, previous_value, new_value)
    values('ventas', 'actualizar_consumo', 'Cambio de consumo/despacho ' || sale.number, auth.uid(),
      to_jsonb(sale), jsonb_build_object('type', p_type, 'delivery_fee', fee, 'total', next_total));
end;
$$;
revoke all on function public.update_order_fulfillment(uuid, public.order_type, numeric, timestamptz) from public;
grant execute on function public.update_order_fulfillment(uuid, public.order_type, numeric, timestamptz) to authenticated;
notify pgrst, 'reload schema';

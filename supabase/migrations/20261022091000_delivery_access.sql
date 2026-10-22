-- Restrictive policies also close permissive legacy policies for driver accounts.
-- Inactive drivers stay restricted; do not base this guard on current_app_role().
create or replace function public.is_delivery_account()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role::text = 'repartidor')
$$;
revoke all on function public.is_delivery_account() from public, anon;
grant execute on function public.is_delivery_account() to authenticated;
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
    and tablename <> 'profiles' and rowsecurity
  loop
    execute format('drop policy if exists delivery_account_isolation on public.%I', t.tablename);
    execute format('create policy delivery_account_isolation on public.%I as restrictive for all to authenticated using (not public.is_delivery_account()) with check (not public.is_delivery_account())', t.tablename);
  end loop;
end;
$$;
drop policy if exists delivery_profile_isolation on public.profiles;
create policy delivery_profile_isolation on public.profiles as restrictive for all to authenticated
using (not public.is_delivery_account() or id = auth.uid())
with check (not public.is_delivery_account());
drop policy if exists delivery_profile_delete_isolation on public.profiles;
create policy delivery_profile_delete_isolation on public.profiles as restrictive for delete to authenticated
using (not public.is_delivery_account());

alter table public.dispatch_orders
  add column if not exists assigned_driver_id uuid references public.profiles(id),
  add column if not exists delivered_at timestamptz;
create index if not exists dispatch_assigned_driver_idx on public.dispatch_orders(assigned_driver_id, status);

-- Minimal projection: drivers do not get direct access to sales, payments or customers.
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
      and d.status <> 'cancelado'
      and (actor.role::text in ('administrador','cajero') or d.assigned_driver_id = actor.id)
  ) r), '[]'::jsonb);
end;
$$;

create or replace function public.list_delivery_drivers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_staff() then raise exception 'Sin permiso para asignar repartidores'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'full_name', full_name) order by full_name)
    from public.profiles where role::text = 'repartidor' and is_active), '[]'::jsonb);
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
  update public.dispatch_orders set assigned_driver_id = p_driver_id where order_id = p_order_id;
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

revoke all on function public.list_delivery_orders() from public, anon;
revoke all on function public.list_delivery_drivers() from public, anon;
revoke all on function public.assign_delivery_driver(uuid,uuid) from public, anon;
revoke all on function public.complete_delivery(uuid) from public, anon;
grant execute on function public.list_delivery_orders() to authenticated;
grant execute on function public.list_delivery_drivers() to authenticated;
grant execute on function public.assign_delivery_driver(uuid,uuid) to authenticated;
grant execute on function public.complete_delivery(uuid) to authenticated;
notify pgrst, 'reload schema';

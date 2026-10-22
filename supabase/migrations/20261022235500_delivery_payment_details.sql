-- Expose only payment method and amounts for orders already authorized by each RPC.
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
      o.payment_method, o.card_type,
      (select jsonb_build_object(
        'cash', coalesce(sum(amount) filter(where method = 'efectivo'),0),
        'card', coalesce(sum(amount) filter(where method = 'tarjeta'),0),
        'transfer', coalesce(sum(amount) filter(where method = 'transferencia'),0))
       from public.order_payments where order_id = o.id) as payment_breakdown,
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

create or replace function public.delivery_history(p_from date default null, p_to date default null,
  p_driver_id uuid default null, p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare actor public.profiles; result jsonb;
begin
  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null or actor.role::text not in ('administrador','repartidor') then raise exception 'Sin permiso para consultar el historial de reparto'; end if;
  if actor.role::text = 'repartidor' and p_driver_id is not null and p_driver_id <> actor.id then raise exception 'Solo puedes consultar tus propias entregas'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception 'Rango de fechas inválido'; end if;
  if p_page is null or p_page < 0 or p_page > 100000 then raise exception 'Página inválida'; end if;
  with history as (
    select o.id, o.number, o.total, o.delivery_fee,
      o.payment_method, o.card_type,
      (select jsonb_build_object(
        'cash', coalesce(sum(amount) filter(where method = 'efectivo'),0),
        'card', coalesce(sum(amount) filter(where method = 'tarjeta'),0),
        'transfer', coalesce(sum(amount) filter(where method = 'transferencia'),0))
       from public.order_payments where order_id = o.id) as payment_breakdown,
      coalesce(d.delivered_driver_id,d.assigned_driver_id) as driver_id,
      coalesce(d.delivered_driver_name,p.full_name,'Sin repartidor registrado') as driver_name,
      d.delivered_at,
      coalesce(d.delivered_at,o.updated_at) as recorded_at,
      coalesce(o.customer_name_snapshot,d.contact_name,c.full_name) as customer_name,
      d.delivered_driver_id is not null as confirmed_attribution
    from public.orders o join public.dispatch_orders d on d.order_id = o.id
    left join public.profiles p on p.id = coalesce(d.delivered_driver_id,d.assigned_driver_id)
    left join public.customers c on c.id = o.customer_id
    where o.type = 'despacho' and o.status = 'entregado' and d.archived_at is null
      and (actor.role::text = 'administrador' or coalesce(d.delivered_driver_id,d.assigned_driver_id) = actor.id)
      and (p_driver_id is null or coalesce(d.delivered_driver_id,d.assigned_driver_id) = p_driver_id)
      and (p_from is null or coalesce(d.delivered_at,o.updated_at) >= (p_from::timestamp at time zone 'America/Santiago'))
      and (p_to is null or coalesce(d.delivered_at,o.updated_at) < ((p_to + 1)::timestamp at time zone 'America/Santiago'))
  ), driver_totals as (
    select driver_id, (array_agg(driver_name order by recorded_at desc,id desc))[1] as driver_name, count(*) as delivered_count,
      coalesce(sum(total),0) as sales_total,
      coalesce(sum(delivery_fee),0) as delivery_fees
    from history group by driver_id
  ), page as (select * from history order by recorded_at desc,id desc limit 50 offset p_page*50)
  select jsonb_build_object(
    'summary', (select jsonb_build_object('delivered_count',count(*),
      'sales_total',coalesce(sum(total),0),'delivery_fees',coalesce(sum(delivery_fee),0)) from history),
    'drivers',coalesce((select jsonb_agg(row_to_json(t) order by driver_name,driver_id) from driver_totals t),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(row_to_json(t) order by recorded_at desc,id desc) from page t),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

notify pgrst,'reload schema';

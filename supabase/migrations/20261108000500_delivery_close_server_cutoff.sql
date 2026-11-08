-- Use the server close statement time so a skewed cashier clock cannot leave shift orders active.
begin;

create or replace function public.archive_delivery_on_cash_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := statement_timestamp();
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

commit;

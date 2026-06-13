-- ============================================================
-- cancel_storefront_order + get_storefront_order_status
-- ============================================================
-- v2 — FIX: los parámetros ahora usan prefijo p_ para evitar la colisión
-- con columnas ("column reference order_id is ambiguous" en PL/pgSQL).
-- Ejecutar COMPLETO en el SQL Editor del dashboard de Supabase.
-- Los DROP son necesarios porque CREATE OR REPLACE no permite renombrar argumentos.

drop function if exists public.cancel_storefront_order(uuid, text, text);
drop function if exists public.get_storefront_order_status(uuid);

-- ── cancel_storefront_order ──────────────────────────────────
-- La anon key no puede hacer UPDATE directo en orders (RLS); el bot usa esta RPC.
-- Reglas: solo órdenes 'pendiente', solo source='whatsapp', teléfono debe coincidir.

create or replace function public.cancel_storefront_order(
  p_order_id uuid,
  p_customer_phone text,
  p_reason text default 'cliente_solicito'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden record;
begin
  select o.id, o.status, o.source, o.customer_phone_snapshot
  into v_orden
  from public.orders o
  where o.id = p_order_id;

  if v_orden.id is null then
    return jsonb_build_object('ok', false, 'error', 'orden_no_encontrada');
  end if;

  if v_orden.source <> 'whatsapp' then
    return jsonb_build_object('ok', false, 'error', 'solo_ordenes_whatsapp');
  end if;

  if regexp_replace(coalesce(v_orden.customer_phone_snapshot, ''), '\D', '', 'g')
     <> regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g') then
    return jsonb_build_object('ok', false, 'error', 'telefono_no_coincide');
  end if;

  if v_orden.status <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'estado_no_cancelable', 'status', v_orden.status);
  end if;

  update public.orders
  set status = 'cancelado',
      cancellation_reason = p_reason
  where id = p_order_id;

  update public.kitchen_tickets
  set status = 'cancelado'
  where order_id = p_order_id;

  return jsonb_build_object('ok', true, 'status', 'cancelado');
end;
$$;

grant execute on function public.cancel_storefront_order(uuid, text, text) to anon;
grant execute on function public.cancel_storefront_order(uuid, text, text) to authenticated;

-- ── get_storefront_order_status ──────────────────────────────
-- La anon key tampoco puede hacer SELECT en orders (RLS); "¿cómo va mi pedido?"
-- usa esta RPC de solo lectura.

create or replace function public.get_storefront_order_status(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden record;
begin
  select o.id, o.number, o.status, o.type, o.estimated_ready_at
  into v_orden
  from public.orders o
  where o.id = p_order_id;

  if v_orden.id is null then
    return jsonb_build_object('ok', false, 'error', 'orden_no_encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_orden.id,
    'number', v_orden.number,
    'status', v_orden.status,
    'type', v_orden.type,
    'estimated_ready_at', v_orden.estimated_ready_at
  );
end;
$$;

grant execute on function public.get_storefront_order_status(uuid) to anon;
grant execute on function public.get_storefront_order_status(uuid) to authenticated;

-- Correlaciona un carrito originado en la web con la orden confirmada por WhatsApp.

create table if not exists public.storefront_whatsapp_handoffs (
  token uuid primary key,
  customer_phone text not null,
  status text not null default 'esperando_whatsapp'
    check (status in ('esperando_whatsapp', 'confirmado', 'expirado')),
  order_id uuid unique references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.storefront_whatsapp_handoffs enable row level security;

create or replace function public.create_storefront_whatsapp_handoff(
  p_token uuid,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
begin
  if length(v_phone) < 8 then
    raise exception 'Telefono invalido.';
  end if;

  insert into public.storefront_whatsapp_handoffs (token, customer_phone)
  values (p_token, v_phone)
  on conflict (token) do update
  set customer_phone = excluded.customer_phone,
      status = 'esperando_whatsapp',
      order_id = null,
      confirmed_at = null,
      expires_at = now() + interval '24 hours';

  return jsonb_build_object('ok', true, 'token', p_token);
end;
$$;

create or replace function public.complete_storefront_whatsapp_handoff(
  p_token uuid,
  p_order_id uuid,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
begin
  update public.storefront_whatsapp_handoffs h
  set status = 'confirmado',
      order_id = p_order_id,
      confirmed_at = now()
  where h.token = p_token
    and h.customer_phone = v_phone
    and h.expires_at > now();

  if not found then
    return jsonb_build_object('ok', false, 'error', 'handoff_no_encontrado');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_storefront_whatsapp_handoff(
  p_token uuid,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_row record;
begin
  select
    h.status as handoff_status,
    h.expires_at,
    o.id as order_id,
    o.number,
    o.status as order_status,
    kt.status as kitchen_status,
    o.type,
    o.total,
    o.estimated_ready_at,
    o.created_at
  into v_row
  from public.storefront_whatsapp_handoffs h
  left join public.orders o on o.id = h.order_id
  left join public.kitchen_tickets kt on kt.order_id = o.id
  where h.token = p_token
    and h.customer_phone = v_phone;

  if v_row.handoff_status is null then
    return jsonb_build_object('ok', false, 'error', 'handoff_no_encontrado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'handoffStatus', case
      when v_row.expires_at <= now() and v_row.order_id is null then 'expirado'
      else v_row.handoff_status
    end,
    'order', case when v_row.order_id is null then null else jsonb_build_object(
      'id', v_row.order_id,
      'number', v_row.number,
      'status', v_row.order_status,
      'kitchenStatus', v_row.kitchen_status,
      'type', v_row.type,
      'total', v_row.total,
      'estimatedReadyAt', v_row.estimated_ready_at,
      'createdAt', v_row.created_at
    ) end
  );
end;
$$;

grant execute on function public.create_storefront_whatsapp_handoff(uuid, text)
to anon, authenticated;
grant execute on function public.complete_storefront_whatsapp_handoff(uuid, uuid, text)
to anon, authenticated;
grant execute on function public.get_storefront_whatsapp_handoff(uuid, text)
to anon, authenticated;

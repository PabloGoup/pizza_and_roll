-- Sales must go through even when the selected cash print computer is inactive or has no
-- printer assigned (the kitchen keeps working from the KDS). Previously create_pos_order_core
-- raised 'El computador de impresión seleccionado no está disponible' and the sale was lost.
-- Now the wrapper drops the unavailable station: the receipt is queued for any available
-- agent (or waits in the queue) and the response carries printAgentUnavailable = true so the
-- POS can warn the cashier.
-- Same body as 20261118000100_pos_large_order_guard.sql plus the station fallback.
-- Idempotent: safe to run more than once.

create or replace function public.create_pos_order(
  p_request_id uuid,
  p_cart jsonb,
  p_checkout jsonb,
  p_print_agent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  response jsonb;
  headers jsonb;
  confirmed boolean;
  print_agent_id uuid := p_print_agent_id;
  printer_skipped boolean := false;
begin
  -- A sale must never fail because the cash printer is offline or unassigned: the kitchen
  -- works from the KDS. Retries of an already saved sale keep the original arguments so the
  -- core's idempotency hash still matches.
  if print_agent_id is not null
     and not exists(select 1 from public.orders where pos_request_id = p_request_id)
     and not exists(select 1 from public.print_agents where id = print_agent_id and is_active and printer_name is not null) then
    print_agent_id := null;
    printer_skipped := true;
  end if;

  response := public.create_pos_order_core(p_request_id, p_cart, p_checkout, print_agent_id);

  confirmed := coalesce(p_checkout->>'largeOrderConfirmed', 'false') = 'true';
  if (response->>'total')::numeric > 100000 and not confirmed then
    -- Raising rolls back the whole sale (order, payments, cash, kitchen ticket, print job).
    raise exception 'Venta sobre $100.000 sin confirmar. Recarga la página del POS y vuelve a intentarlo.';
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;

  update public.orders
     set pos_session_id = nullif(auth.jwt()->>'session_id', '')::uuid,
         pos_client = jsonb_strip_nulls(jsonb_build_object(
           'userAgent', headers->>'user-agent',
           'ip', coalesce(headers->>'cf-connecting-ip', split_part(headers->>'x-forwarded-for', ',', 1)),
           'origin', headers->>'origin',
           'largeOrderConfirmed', confirmed
         ))
   where id = (response->>'id')::uuid
     and pos_session_id is null;

  if printer_skipped then
    response := response || jsonb_build_object('printAgentUnavailable', true);
  end if;

  return response;
end;
$$;

revoke all on function public.create_pos_order(uuid,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.create_pos_order(uuid,jsonb,jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';

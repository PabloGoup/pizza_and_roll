-- Guard against "phantom" POS sales: a stale browser with an old persisted cart
-- submitted 40+20+20 hand roll orders ($250.000 / $500.000) without anyone noticing.
--
-- 1. Sales above $100.000 must carry p_checkout.largeOrderConfirmed = true, which the
--    POS only sends after the cashier confirms a dialog listing the cart. Old cached
--    POS tabs never send it, so they cannot create large orders anymore.
-- 2. Every POS sale records the auth session, user agent and IP that created it, so the
--    device can be identified from the order itself (orders.pos_session_id matches
--    auth.sessions.id).
--
-- The existing create_pos_order body is kept exactly as deployed (renamed to
-- create_pos_order_core) so this migration cannot revert any production hotfix.
-- Idempotent: safe to run more than once.

alter table public.orders
  add column if not exists pos_session_id uuid,
  add column if not exists pos_client jsonb;

do $$
begin
  if to_regprocedure('public.create_pos_order_core(uuid,jsonb,jsonb,uuid)') is null then
    alter function public.create_pos_order(uuid,jsonb,jsonb,uuid) rename to create_pos_order_core;
  end if;
end;
$$;

revoke all on function public.create_pos_order_core(uuid,jsonb,jsonb,uuid) from public, anon, authenticated;

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
begin
  response := public.create_pos_order_core(p_request_id, p_cart, p_checkout, p_print_agent_id);

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

  return response;
end;
$$;

revoke all on function public.create_pos_order(uuid,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.create_pos_order(uuid,jsonb,jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';

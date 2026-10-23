-- Verify on the real schema with a subtransaction that is always rolled back.
-- No test sale, kitchen ticket, print job, cash movement or audit event persists.
do $$
declare actor_id uuid; cart jsonb; amount numeric; response jsonb; started timestamptz; elapsed numeric;
begin
 select id into actor_id from public.profiles where is_active and role::text in ('administrador','cajero') order by created_at limit 1;
 select jsonb_agg(jsonb_build_object('productId',id,'quantity',1,'unitPrice',base_price,'modifiers','[]'::jsonb)),sum(base_price) into cart,amount
 from (select p.id,p.base_price from public.products p where p.status='activo' and not p.is_sold_out and not exists(select 1 from public.recipes r join public.recipe_items ri on ri.recipe_id=r.id join public.ingredients i on i.id=ri.ingredient_id where r.product_id=p.id and i.is_sold_out) order by p.id limit 3) items;
 if actor_id is null or cart is null or not exists(select 1 from public.cash_sessions where status='abierta') then
   raise notice 'Live rollback benchmark skipped: requires staff, products and open drawer'; return;
 end if;
 perform set_config('request.jwt.claim.sub',actor_id::text,true);
 begin
   started:=clock_timestamp();
   response:=public.create_pos_order(gen_random_uuid(),cart,jsonb_build_object('type','consumo_local','paymentMethod','tarjeta','cardType','debito','paymentBreakdown',jsonb_build_object('cash',0,'card',amount,'transfer',0),'deliveryFee',0,'discountAmount',0,'promotionAmount',0,'extraCharges','[]'::jsonb));
   elapsed:=round(extract(epoch from (clock_timestamp()-started))*1000,1);
   if response->>'id' is null or not exists(select 1 from public.kitchen_tickets where order_id=(response->>'id')::uuid) or not exists(select 1 from public.print_jobs where order_id=(response->>'id')::uuid) then raise exception 'Incomplete checkout benchmark'; end if;
   raise exception using errcode='P0002',message='Rollback benchmark completed';
 exception when no_data_found then
   raise notice 'Live checkout database duration: % ms for % items (rolled back, no printing)',elapsed,jsonb_array_length(cart);
 end;
end;
$$;

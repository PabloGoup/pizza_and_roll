-- Baseline from actual persisted timestamps; no customer information is logged.
do $$
declare metrics jsonb;
begin
  select jsonb_build_object('sample',count(*),'median_ms',round((percentile_cont(0.5) within group(order by ms))::numeric,1),'p95_ms',round((percentile_cont(0.95) within group(order by ms))::numeric,1)) into metrics
  from (select extract(epoch from (k.created_at-o.created_at))*1000 ms from public.orders o join public.kitchen_tickets k on k.order_id=o.id where o.source='pos' order by o.created_at desc limit 100) t;
  raise notice 'POS order-to-kitchen baseline: %',metrics;
end;
$$;
alter table public.orders add column if not exists pos_request_id uuid, add column if not exists pos_request_hash text;
create unique index if not exists orders_pos_request_idx on public.orders(pos_request_id) where pos_request_id is not null;

create or replace function public.pos_order_response(p_order_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'id',o.id,'number',o.number,'source',o.source,'type',o.type,'status',o.status,
  'paymentMethod',o.payment_method,'cardType',o.card_type,
  'paymentBreakdown',(select jsonb_build_object('cash',coalesce(sum(amount) filter(where method='efectivo'),0),'card',coalesce(sum(amount) filter(where method='tarjeta'),0),'transfer',coalesce(sum(amount) filter(where method='transferencia'),0)) from public.order_payments where order_id=o.id),
  'subtotal',o.subtotal,'discountAmount',o.discount_amount,'promotionAmount',o.promotion_amount,
  'deliveryFee',o.delivery_fee,'tipAmount',o.tip_amount,'extraCharges',o.extra_charges,'total',o.total,'notes',o.notes,
  'cashierId',o.cashier_id,'cashierName',p.full_name,'customerNameSnapshot',o.customer_name_snapshot,'customerPhoneSnapshot',o.customer_phone_snapshot,
  'customer',case when c.id is null then null else jsonb_build_object('id',c.id,'fullName',c.full_name,'phone',c.phone,'addresses','[]'::jsonb) end,
  'deliveryAddress',case when a.id is null then null else jsonb_build_object('id',a.id,'label',a.label,'street',a.street,'district',a.district,'reference',a.reference,'isDefault',a.is_default) end,
  'createdAt',o.created_at,'updatedAt',o.updated_at,'estimatedReadyAt',o.estimated_ready_at,'kitchenPrintQueued',true,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'productName',pr.name,'categoryName',coalesce(cat.name,'General'),
    'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal,'notes',i.notes,'variantId',i.variant_id,'variantName',v.name,
    'modifiers',coalesce((select jsonb_agg(jsonb_build_object('id',coalesce(m.modifier_id::text,'manual:'||m.id::text),'name',m.modifier_name_snapshot,'priceDelta',m.price_delta) order by m.id) from public.order_item_modifiers m where m.order_item_id=i.id),'[]'::jsonb)) order by i.id)
    from public.order_items i join public.products pr on pr.id=i.product_id left join public.product_categories cat on cat.id=pr.category_id left join public.product_variants v on v.id=i.variant_id where i.order_id=o.id),'[]'::jsonb))
 from public.orders o join public.profiles p on p.id=o.cashier_id left join public.customers c on c.id=o.customer_id left join public.customer_addresses a on a.id=o.delivery_address_id where o.id=p_order_id
$$;
revoke all on function public.pos_order_response(uuid) from public,anon,authenticated;

create or replace function public.create_pos_order(p_request_id uuid,p_cart jsonb,p_checkout jsonb,p_print_agent_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare
 actor public.profiles; drawer public.cash_sessions; saved public.orders; item jsonb; modifier jsonb; extra jsonb;
 item_id uuid; modifier_id uuid; customer_id uuid; address_id uuid; product_id uuid; variant_id uuid;
 qty numeric; unit_price numeric; line_total numeric; goods numeric:=0; extras numeric:=0; fee numeric; tip numeric;
 discount numeric; promo numeric; total numeric; cash numeric; card numeric; transfer numeric;
 method public.payment_method; kind public.order_type; request_hash text; response jsonb; job_id uuid;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active and role::text in ('administrador','cajero');
 if actor.id is null then raise exception 'Sin permiso para registrar ventas'; end if;
 if p_request_id is null then raise exception 'Falta identificador de la venta'; end if;
 if jsonb_typeof(p_cart) is distinct from 'array' or jsonb_array_length(p_cart) not between 1 and 300 then raise exception 'Revisa los productos del carrito'; end if;
 request_hash:=md5(p_cart::text||p_checkout::text||coalesce(p_print_agent_id::text,''));
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into saved from public.orders where pos_request_id=p_request_id;
 if found then
   if saved.cashier_id<>actor.id or saved.pos_request_hash is distinct from request_hash then raise exception 'El identificador ya pertenece a otra venta'; end if;
   return public.pos_order_response(saved.id);
 end if;
 select * into drawer from public.cash_sessions where status='abierta' order by opened_at desc limit 1 for update;
 if drawer.id is null then raise exception 'Debes abrir caja antes de registrar ventas'; end if;
 kind:=(p_checkout->>'type')::public.order_type;
 method:=(p_checkout->>'paymentMethod')::public.payment_method;
 fee:=coalesce((p_checkout->>'deliveryFee')::numeric,0); tip:=coalesce((p_checkout->>'tipAmount')::numeric,0);
 discount:=coalesce((p_checkout->>'discountAmount')::numeric,0); promo:=coalesce((p_checkout->>'promotionAmount')::numeric,0);
 if kind='despacho' and fee<2000 then raise exception 'La tarifa mínima de despacho es $2.000'; end if;
 if fee<0 or tip<0 or discount<0 or promo<0 or (kind<>'despacho' and fee<>0) then raise exception 'Revisa los cargos y descuentos'; end if;
 if p_checkout->>'assignedDriverId' is not null and kind='despacho' and not exists(select 1 from public.profiles where id=(p_checkout->>'assignedDriverId')::uuid and role::text='repartidor' and is_active) then raise exception 'Repartidor no disponible'; end if;
 if p_print_agent_id is not null and not exists(select 1 from public.print_agents where id=p_print_agent_id and is_active and printer_name is not null) then raise exception 'El computador de impresión seleccionado no está disponible'; end if;
 for item in select value from jsonb_array_elements(p_cart) loop
   qty:=(item->>'quantity')::numeric; unit_price:=(item->>'unitPrice')::numeric;
   if qty is null or qty<=0 or qty<>trunc(qty) or unit_price is null or unit_price<0 then raise exception 'Revisa cantidades y precios'; end if;
   line_total:=unit_price;
   for modifier in select value from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) loop
     if modifier->>'name' is null or modifier->>'priceDelta' is null then raise exception 'Agregado incompleto'; end if;
     line_total:=line_total+(modifier->>'priceDelta')::numeric;
   end loop;
   if line_total<0 then raise exception 'Precio de producto inválido'; end if;
   goods:=goods+line_total*qty;
 end loop;
 for extra in select value from jsonb_array_elements(coalesce(p_checkout->'extraCharges','[]'::jsonb)) loop
   if coalesce((extra->>'total')::numeric,-1)<0 then raise exception 'Cargo adicional inválido'; end if;
   extras:=extras+(extra->>'total')::numeric;
 end loop;
 total:=round(goods+fee+extras-discount-promo+tip,2);
 cash:=coalesce((p_checkout#>>'{paymentBreakdown,cash}')::numeric,0);
 card:=coalesce((p_checkout#>>'{paymentBreakdown,card}')::numeric,0);
 transfer:=coalesce((p_checkout#>>'{paymentBreakdown,transfer}')::numeric,0);
 if total<0 or least(cash,card,transfer)<0 or cash+card+transfer<>total or
   (method='efectivo' and cash<>total) or (method='tarjeta' and card<>total) or (method='transferencia' and transfer<>total) then raise exception 'El pago debe cuadrar con el total final'; end if;
 if nullif(trim(p_checkout->>'customerName'),'') is not null and nullif(trim(p_checkout->>'customerPhone'),'') is not null then
   select id into customer_id from public.customers where phone=trim(p_checkout->>'customerPhone') order by created_at limit 1;
   if customer_id is null then insert into public.customers(full_name,phone) values(trim(p_checkout->>'customerName'),trim(p_checkout->>'customerPhone')) returning id into customer_id; end if;
 end if;
 if kind='despacho' and coalesce(nullif(trim(p_checkout->>'addressStreet'),''),nullif(trim(p_checkout->>'addressDistrict'),''),nullif(trim(p_checkout->>'addressReference'),'')) is not null then
   insert into public.customer_addresses(customer_id,label,street,district,reference,is_default)
   values(customer_id,coalesce(nullif(trim(p_checkout->>'addressLabel'),''),'Principal'),coalesce(trim(p_checkout->>'addressStreet'),''),coalesce(trim(p_checkout->>'addressDistrict'),''),nullif(trim(p_checkout->>'addressReference'),''),customer_id is not null) returning id into address_id;
 end if;
 insert into public.orders(type,status,payment_method,card_type,subtotal,discount_amount,promotion_amount,delivery_fee,tip_amount,extra_charges,total,notes,cashier_id,customer_id,delivery_address_id,customer_name_snapshot,customer_phone_snapshot,pos_request_id,pos_request_hash)
 values(kind,'pendiente',method,case when method in ('tarjeta','mixto') then nullif(p_checkout->>'cardType','') else null end,goods+fee+extras,discount,promo,fee,tip,coalesce(p_checkout->'extraCharges','[]'::jsonb),total,nullif(p_checkout->>'notes',''),actor.id,customer_id,address_id,nullif(trim(p_checkout->>'customerName'),''),nullif(trim(p_checkout->>'customerPhone'),''),p_request_id,request_hash) returning * into saved;
 insert into public.order_payments(order_id,method,amount) select saved.id,m,a from (values('efectivo'::public.payment_method,cash),('tarjeta'::public.payment_method,card),('transferencia'::public.payment_method,transfer)) pay(m,a) where a>0;
 for item in select value from jsonb_array_elements(p_cart) loop
   product_id:=(item->>'productId')::uuid; variant_id:=nullif(item->>'variantId','')::uuid;
   if variant_id is not null and not exists(select 1 from public.product_variants where id=variant_id and product_variants.product_id=product_id) then raise exception 'La variante no corresponde al producto'; end if;
   if not exists(select 1 from public.products where id=product_id and status='activo') then raise exception 'Producto no disponible'; end if;
   select coalesce(sum((value->>'priceDelta')::numeric),0) into line_total from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb));
   insert into public.order_items(order_id,product_id,variant_id,quantity,unit_price,subtotal,notes)
   values(saved.id,product_id,variant_id,(item->>'quantity')::numeric,(item->>'unitPrice')::numeric,((item->>'unitPrice')::numeric+line_total)*(item->>'quantity')::numeric,nullif(item->>'notes','')) returning id into item_id;
   for modifier in select value from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) loop
     modifier_id:=null;
     if coalesce(modifier->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
       select id into modifier_id from public.product_modifiers where id=(modifier->>'id')::uuid;
     end if;
     insert into public.order_item_modifiers(order_item_id,modifier_id,modifier_name_snapshot,price_delta) values(item_id,modifier_id,modifier->>'name',(modifier->>'priceDelta')::numeric);
   end loop;
 end loop;
 if kind='despacho' then
   insert into public.dispatch_orders(order_id,assigned_driver_id,contact_name,contact_phone,delivery_fee) values(saved.id,nullif(p_checkout->>'assignedDriverId','')::uuid,nullif(p_checkout->>'customerName',''),nullif(p_checkout->>'customerPhone',''),fee);
 end if;
 if cash>0 then
   insert into public.cash_movements(session_id,type,amount,reason,performed_by,linked_order_id) values(drawer.id,'ingreso',cash,'Venta '||saved.number,actor.id,saved.id);
   update public.cash_sessions set expected_amount=expected_amount+cash where id=drawer.id;
 end if;
 -- The ticket and print job become visible only after all sale data commits.
 insert into public.kitchen_tickets(order_id,status) values(saved.id,'pendiente');
 job_id:=public.enqueue_kitchen_print(saved.id,'new','new:'||saved.id::text,p_print_agent_id);
 update public.print_jobs set available_at=now() where id=job_id;
 response:=public.pos_order_response(saved.id);
 insert into public.audit_logs(module,action,detail,performed_by,new_value) values('ventas','crear','Registro de la venta '||saved.number,actor.id,response);
 return response;
end;
$$;
revoke all on function public.create_pos_order(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.create_pos_order(uuid,jsonb,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';

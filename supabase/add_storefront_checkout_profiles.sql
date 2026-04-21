alter table public.orders
  alter column cashier_id drop not null;

create or replace function public.create_storefront_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cart jsonb := coalesce(payload->'cart', '[]'::jsonb);
  checkout jsonb := coalesce(payload->'checkout', '{}'::jsonb);
  order_type public.order_type := coalesce((checkout->>'type')::public.order_type, 'retiro_local');
  payment_method public.payment_method := coalesce((checkout->>'paymentMethod')::public.payment_method, 'transferencia');
  customer_name text := nullif(trim(checkout->>'customerName'), '');
  customer_phone text := regexp_replace(coalesce(checkout->>'customerPhone', ''), '\D', '', 'g');
  notes text := nullif(trim(checkout->>'notes'), '');
  address_label text := coalesce(nullif(trim(checkout->>'addressLabel'), ''), 'Casa');
  address_street text := nullif(trim(checkout->>'addressStreet'), '');
  address_district text := nullif(trim(checkout->>'addressDistrict'), '');
  address_reference text := nullif(trim(checkout->>'addressReference'), '');
  discount_amount numeric(12, 2) := greatest(coalesce((checkout->>'discountAmount')::numeric, 0), 0);
  promotion_amount numeric(12, 2) := greatest(coalesce((checkout->>'promotionAmount')::numeric, 0), 0);
  extra_charges jsonb := coalesce(checkout->'extraCharges', '[]'::jsonb);
  input_delivery_fee numeric(12, 2) := greatest(coalesce((checkout->>'deliveryFee')::numeric, 0), 0);
  delivery_fee numeric(12, 2) := input_delivery_fee;
  payment_breakdown jsonb := coalesce(checkout->'paymentBreakdown', '{}'::jsonb);
  subtotal numeric(12, 2) := 0;
  extras_total numeric(12, 2) := 0;
  total numeric(12, 2) := 0;
  pending_orders integer := 0;
  pickup_base_minutes integer := 20;
  delivery_base_minutes integer := 35;
  per_pending_order_minutes integer := 3;
  computed_minutes integer := 20;
  estimated_ready_at timestamptz;
  customer_id uuid := null;
  delivery_address_id uuid := null;
  order_row public.orders%rowtype;
  order_item_row public.order_items%rowtype;
  dispatch_zone public.delivery_zones%rowtype;
  customer_row public.customers%rowtype;
  item jsonb;
  modifier jsonb;
  payment_cash numeric(12, 2) := 0;
  payment_card numeric(12, 2) := 0;
  payment_transfer numeric(12, 2) := 0;
  item_quantity numeric(10, 2);
  item_unit_price numeric(12, 2);
  item_modifiers_total numeric(12, 2);
  item_subtotal numeric(12, 2);
  item_variant_id uuid;
  item_modifier_id uuid;
begin
  if jsonb_typeof(cart) <> 'array' or jsonb_array_length(cart) = 0 then
    raise exception 'Agrega al menos un producto al carrito.';
  end if;

  if customer_name is null or customer_phone = '' or length(customer_phone) < 8 then
    raise exception 'Debes indicar nombre y teléfono válidos.';
  end if;

  if order_type = 'despacho' and (address_street is null or address_district is null) then
    raise exception 'Para despacho debes completar dirección y comuna.';
  end if;

  select
    coalesce(pickup_base_minutes, 20),
    coalesce(delivery_base_minutes, 35),
    coalesce(per_pending_order_minutes, 3)
  into pickup_base_minutes, delivery_base_minutes, per_pending_order_minutes
  from public.store_settings
  limit 1;

  if order_type = 'despacho' then
    select *
    into dispatch_zone
    from public.delivery_zones
    where is_active = true
      and lower(district) = lower(address_district)
    order by sort_order asc, name asc
    limit 1;

    if dispatch_zone.id is null then
      raise exception 'La comuna indicada no tiene cobertura de despacho.';
    end if;

    delivery_fee := greatest(coalesce(dispatch_zone.fee, input_delivery_fee, 0), 0);
    computed_minutes := greatest(coalesce(dispatch_zone.base_minutes, delivery_base_minutes), 0);
  else
    delivery_fee := 0;
    computed_minutes := greatest(pickup_base_minutes, 0);
  end if;

  if jsonb_typeof(extra_charges) = 'array' then
    select coalesce(
      sum(
        coalesce((charge->>'total')::numeric, 0)
      ),
      0
    )
    into extras_total
    from jsonb_array_elements(extra_charges) charge;
  end if;

  for item in select value from jsonb_array_elements(cart)
  loop
    item_quantity := greatest(coalesce((item->>'quantity')::numeric, 1), 1);
    item_unit_price := greatest(coalesce((item->>'unitPrice')::numeric, 0), 0);
    item_modifiers_total := 0;

    if jsonb_typeof(coalesce(item->'modifiers', '[]'::jsonb)) = 'array' then
      select coalesce(sum(coalesce((modifier_row->>'priceDelta')::numeric, 0)), 0)
      into item_modifiers_total
      from jsonb_array_elements(item->'modifiers') modifier_row;
    end if;

    item_subtotal := (item_unit_price + item_modifiers_total) * item_quantity;
    subtotal := subtotal + item_subtotal;
  end loop;

  total := greatest(subtotal + delivery_fee + extras_total - discount_amount - promotion_amount, 0);

  select count(*)
  into pending_orders
  from public.orders
  where status in ('pendiente', 'en_preparacion')
    and created_at >= now() - interval '12 hours';

  computed_minutes := computed_minutes + (pending_orders * per_pending_order_minutes);
  estimated_ready_at := timezone('utc', now()) + make_interval(mins => computed_minutes);

  select *
  into customer_row
  from public.customers
  where phone = customer_phone
  limit 1;

  if customer_row.id is null then
    insert into public.customers (
      full_name,
      phone
    )
    values (
      customer_name,
      customer_phone
    )
    returning *
    into customer_row;
  else
    update public.customers
    set
      full_name = customer_name
    where id = customer_row.id
    returning *
    into customer_row;
  end if;

  customer_id := customer_row.id;

  if order_type = 'despacho' then
    select id
    into delivery_address_id
    from public.customer_addresses
    where customer_id = customer_row.id
      and street = address_street
      and district = address_district
    limit 1;

    if delivery_address_id is null then
      insert into public.customer_addresses (
        customer_id,
        label,
        street,
        district,
        reference,
        is_default
      )
      values (
        customer_row.id,
        address_label,
        address_street,
        address_district,
        address_reference,
        not exists (
          select 1
          from public.customer_addresses
          where customer_id = customer_row.id
        )
      )
      returning id
      into delivery_address_id;
    end if;
  end if;

  case payment_method
    when 'efectivo' then
      payment_cash := total;
    when 'tarjeta' then
      payment_card := total;
    when 'transferencia' then
      payment_transfer := total;
    when 'mixto' then
      payment_cash := greatest(coalesce((payment_breakdown->>'cash')::numeric, 0), 0);
      payment_card := greatest(coalesce((payment_breakdown->>'card')::numeric, 0), 0);
      payment_transfer := greatest(coalesce((payment_breakdown->>'transfer')::numeric, 0), 0);

      if (payment_cash + payment_card + payment_transfer) <> total then
        raise exception 'El pago mixto debe cuadrar con el total final.';
      end if;
  end case;

  insert into public.orders (
    source,
    type,
    status,
    payment_method,
    subtotal,
    discount_amount,
    promotion_amount,
    delivery_fee,
    extra_charges,
    total,
    notes,
    cashier_id,
    customer_id,
    delivery_address_id,
    estimated_ready_at,
    customer_phone_snapshot,
    customer_name_snapshot
  )
  values (
    'web',
    order_type,
    'pendiente',
    payment_method,
    subtotal + delivery_fee + extras_total,
    discount_amount,
    promotion_amount,
    delivery_fee,
    extra_charges,
    total,
    notes,
    null,
    customer_id,
    delivery_address_id,
    estimated_ready_at,
    customer_phone,
    customer_name
  )
  returning *
  into order_row;

  if payment_cash > 0 then
    insert into public.order_payments (order_id, method, amount)
    values (order_row.id, 'efectivo', payment_cash);
  end if;

  if payment_card > 0 then
    insert into public.order_payments (order_id, method, amount)
    values (order_row.id, 'tarjeta', payment_card);
  end if;

  if payment_transfer > 0 then
    insert into public.order_payments (order_id, method, amount)
    values (order_row.id, 'transferencia', payment_transfer);
  end if;

  for item in select value from jsonb_array_elements(cart)
  loop
    item_quantity := greatest(coalesce((item->>'quantity')::numeric, 1), 1);
    item_unit_price := greatest(coalesce((item->>'unitPrice')::numeric, 0), 0);
    item_modifiers_total := 0;

    if jsonb_typeof(coalesce(item->'modifiers', '[]'::jsonb)) = 'array' then
      select coalesce(sum(coalesce((modifier_row->>'priceDelta')::numeric, 0)), 0)
      into item_modifiers_total
      from jsonb_array_elements(item->'modifiers') modifier_row;
    end if;

    item_subtotal := (item_unit_price + item_modifiers_total) * item_quantity;
    item_variant_id := case
      when coalesce(item->>'variantId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item->>'variantId')::uuid
      else null
    end;

    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      quantity,
      unit_price,
      subtotal,
      notes
    )
    values (
      order_row.id,
      (item->>'productId')::uuid,
      item_variant_id,
      item_quantity,
      item_unit_price,
      item_subtotal,
      nullif(trim(item->>'notes'), '')
    )
    returning *
    into order_item_row;

    if jsonb_typeof(coalesce(item->'modifiers', '[]'::jsonb)) = 'array' then
      for modifier in select value from jsonb_array_elements(item->'modifiers')
      loop
        item_modifier_id := case
          when coalesce(modifier->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (modifier->>'id')::uuid
          else null
        end;

        insert into public.order_item_modifiers (
          order_item_id,
          modifier_id,
          modifier_name_snapshot,
          price_delta
        )
        values (
          order_item_row.id,
          item_modifier_id,
          coalesce(nullif(trim(modifier->>'name'), ''), 'Modificador'),
          greatest(coalesce((modifier->>'priceDelta')::numeric, 0), 0)
        );
      end loop;
    end if;
  end loop;

  insert into public.kitchen_tickets (
    order_id,
    status
  )
  values (
    order_row.id,
    'pendiente'
  );

  if order_type = 'despacho' then
    insert into public.dispatch_orders (
      order_id,
      status,
      zone_id,
      contact_name,
      contact_phone,
      delivery_fee,
      estimated_delivery_at
    )
    values (
      order_row.id,
      'pendiente',
      dispatch_zone.id,
      customer_name,
      customer_phone,
      delivery_fee,
      estimated_ready_at
    );
  end if;

  return jsonb_build_object(
    'orderId', order_row.id,
    'number', order_row.number,
    'total', order_row.total,
    'estimatedReadyAt', order_row.estimated_ready_at,
    'customerId', customer_id
  );
end;
$$;

create or replace function public.get_storefront_customer_profile(customer_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text := regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g');
  customer_row public.customers%rowtype;
begin
  if normalized_phone = '' then
    return null;
  end if;

  select *
  into customer_row
  from public.customers
  where phone = normalized_phone
  limit 1;

  if customer_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', customer_row.id,
      'fullName', customer_row.full_name,
      'phone', customer_row.phone
    ),
    'addresses', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', address.id,
            'label', address.label,
            'street', address.street,
            'district', address.district,
            'reference', address.reference,
            'isDefault', address.is_default
          )
          order by address.is_default desc, address.label asc
        )
        from public.customer_addresses address
        where address.customer_id = customer_row.id
      ),
      '[]'::jsonb
    ),
    'recentOrders', coalesce(
      (
        select jsonb_agg(order_payload order by created_at desc)
        from (
          select
            order_row.created_at,
            jsonb_build_object(
              'id', order_row.id,
              'number', order_row.number,
              'createdAt', order_row.created_at,
              'total', order_row.total,
              'type', order_row.type,
              'itemsSummary', coalesce(
                (
                  select jsonb_agg(distinct product.name order by product.name)
                  from public.order_items item
                  join public.products product on product.id = item.product_id
                  where item.order_id = order_row.id
                ),
                '[]'::jsonb
              )
            ) as order_payload
          from public.orders order_row
          where order_row.customer_id = customer_row.id
            and order_row.status <> 'cancelado'
          order by order_row.created_at desc
          limit 5
        ) recent
      ),
      '[]'::jsonb
    ),
    'recommendedProducts', coalesce(
      (
        select jsonb_agg(recommendation_payload order by order_count desc, last_ordered_at desc)
        from (
          select
            count(*)::int as order_count,
            max(order_row.created_at) as last_ordered_at,
            jsonb_build_object(
              'productId', product.id,
              'productName', product.name,
              'categoryName', coalesce(category.name, 'General'),
              'imageUrl', product.image_url,
              'unitPrice', coalesce(
                (
                  select variant.price
                  from public.product_variants variant
                  where variant.product_id = product.id
                  order by variant.is_default desc, variant.price asc
                  limit 1
                ),
                product.base_price
              ),
              'orderCount', count(*)::int,
              'lastOrderedAt', max(order_row.created_at)
            ) as recommendation_payload
          from public.orders order_row
          join public.order_items item on item.order_id = order_row.id
          join public.products product on product.id = item.product_id
          left join public.product_categories category on category.id = product.category_id
          where order_row.customer_id = customer_row.id
            and order_row.status <> 'cancelado'
          group by product.id, product.name, category.name, product.image_url, product.base_price
          order by count(*) desc, max(order_row.created_at) desc
          limit 6
        ) recommendations
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.create_storefront_order(jsonb) to anon, authenticated;
grant execute on function public.get_storefront_customer_profile(text) to anon, authenticated;

-- ============================================================
-- SECURITY FIXES + ROL COCINA — Pizza & Roll POS
-- ============================================================
-- Ejecutar completo en el SQL Editor del dashboard de Supabase.
-- Cubre todos los hallazgos de la auditoría de seguridad
-- y agrega el nuevo rol 'cocina' para el personal de kitchen.
-- ============================================================

-- ── 0. PREREQUISITO — ejecutar add_cocina_role_enum.sql PRIMERO ──────
-- PostgreSQL no permite usar un valor de enum nuevo en la misma
-- transacción en que fue creado con ALTER TYPE ADD VALUE.
-- Corre add_cocina_role_enum.sql por separado, espera "Success",
-- y luego ejecuta este script completo.

-- Política: el rol cocina puede actualizar el estado de órdenes.
-- Necesario para que marcarListo() actualice orders.status = 'listo'
-- y dispare el webhook de notificación WhatsApp al cliente.

create policy "orders cocina status update" on public.orders
for update to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'cocina'
      and is_active = true
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'cocina'
      and is_active = true
  )
);

-- ── 1. is_admin() y current_app_role() — verificar is_active ─────────
-- Usuarios desactivados seguían teniendo acceso de admin/staff.

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'administrador'
        and is_active = true
    ),
    false
  )
$$;

-- ── 2. RLS customer_addresses — restringir a staff ───────────────────
-- Antes: cualquier usuario autenticado (incluyendo clientes) podía
-- crear, editar y eliminar direcciones de cualquier otro cliente.
-- La función create_storefront_order() usa SECURITY DEFINER, por lo
-- que puede insertar direcciones sin pasar por esta política.

drop policy if exists "customer addresses staff manage" on public.customer_addresses;

create policy "customer addresses staff manage" on public.customer_addresses
for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('administrador', 'cajero')
      and is_active = true
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('administrador', 'cajero')
      and is_active = true
  )
);

-- ── 3. audit_logs INSERT — solo staff puede insertar ─────────────────
-- Antes: cualquier usuario autenticado (incluyendo clientes) podía
-- insertar logs de auditoría con cualquier descripción de acción.

drop policy if exists "audit staff insert" on public.audit_logs;

create policy "audit staff insert" on public.audit_logs
for insert to authenticated
with check (
  performed_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('administrador', 'cajero')
      and is_active = true
  )
);

-- ── 4. create_storefront_order() — validación completa ───────────────
-- CRÍTICO: el precio, cantidad y modificadores se tomaban del cliente
-- sin validar contra la base de datos. Un atacante podía enviar
-- unitPrice=1 para una pizza de $15.000. Fix: precios siempre desde BD.

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
  -- Descuentos/promociones no se aceptan del cliente en el storefront.
  -- El POS los aplica directamente con validación staff.
  discount_amount numeric(12, 2) := 0;
  promotion_amount numeric(12, 2) := 0;
  extra_charges jsonb := '[]'::jsonb;
  delivery_fee numeric(12, 2) := 0;
  payment_breakdown jsonb := coalesce(checkout->'paymentBreakdown', '{}'::jsonb);
  subtotal numeric(12, 2) := 0;
  total numeric(12, 2) := 0;
  pending_orders integer := 0;
  pickup_base_minutes integer := 20;
  delivery_base_minutes integer := 35;
  per_pending_order_minutes integer := 3;
  computed_minutes integer := 20;
  estimated_ready_at timestamptz;
  order_source public.order_source := coalesce(
    (checkout->>'source')::public.order_source,
    'web'
  );
  input_cashier_id uuid := case
    when coalesce(checkout->>'cashier_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (checkout->>'cashier_id')::uuid
    else null
  end;
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
  -- Variables para validación de precios desde BD
  v_db_item_price numeric(12, 2);
  v_db_modifier_delta numeric(12, 2);
begin
  -- ── Validaciones iniciales ─────────────────────────────────────────

  if jsonb_typeof(cart) <> 'array' or jsonb_array_length(cart) = 0 then
    raise exception 'Agrega al menos un producto al carrito.';
  end if;

  if jsonb_array_length(cart) > 30 then
    raise exception 'El carrito no puede tener más de 30 tipos de producto.';
  end if;

  if customer_name is null or customer_phone = '' or length(customer_phone) < 8 then
    raise exception 'Debes indicar nombre y teléfono válidos.';
  end if;

  -- Limites de longitud para campos de texto libre
  if length(customer_name) > 100 then
    raise exception 'El nombre no puede superar 100 caracteres.';
  end if;

  if notes is not null and length(notes) > 500 then
    raise exception 'Las notas no pueden superar 500 caracteres.';
  end if;

  if address_street is not null and length(address_street) > 200 then
    raise exception 'La dirección no puede superar 200 caracteres.';
  end if;

  if address_reference is not null and length(address_reference) > 200 then
    raise exception 'La referencia no puede superar 200 caracteres.';
  end if;

  if order_type = 'despacho' and (address_street is null or address_district is null) then
    raise exception 'Para despacho debes completar dirección y comuna.';
  end if;

  -- ── Configuración del local ────────────────────────────────────────

  select
    coalesce(max(settings.pickup_base_minutes), 20),
    coalesce(max(settings.delivery_base_minutes), 35),
    coalesce(max(settings.per_pending_order_minutes), 3)
  into pickup_base_minutes, delivery_base_minutes, per_pending_order_minutes
  from public.store_settings settings;

  -- ── Zona de despacho ───────────────────────────────────────────────

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

    delivery_fee := greatest(coalesce(dispatch_zone.fee, 0), 0);
    computed_minutes := greatest(coalesce(dispatch_zone.base_minutes, delivery_base_minutes), 0);
  else
    delivery_fee := 0;
    computed_minutes := greatest(pickup_base_minutes, 0);
  end if;

  -- ── Cálculo de subtotal con precios validados desde BD ────────────
  -- Los precios del cliente se ignoran; se usan siempre los de la BD.

  for item in select value from jsonb_array_elements(cart)
  loop
    -- Cantidad: entre 1 y 100 unidades por item
    item_quantity := least(greatest(coalesce((item->>'quantity')::numeric, 1), 1), 100);

    -- Resolver variante
    item_variant_id := case
      when coalesce(item->>'variantId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item->>'variantId')::uuid
      else null
    end;

    -- Precio real desde BD (variante primero, luego producto base)
    v_db_item_price := null;

    if item_variant_id is not null then
      select v.price into v_db_item_price
      from public.product_variants v
      where v.id = item_variant_id
        and v.product_id = (item->>'productId')::uuid;
    end if;

    if v_db_item_price is null then
      select p.base_price into v_db_item_price
      from public.products p
      where p.id = (item->>'productId')::uuid
        and p.status = 'activo';
    end if;

    if v_db_item_price is null then
      raise exception 'Producto no disponible o inactivo.';
    end if;

    -- Usar precio de BD, ignorar precio del cliente
    item_unit_price := v_db_item_price;

    -- Modificadores: validar priceDelta contra BD
    item_modifiers_total := 0;

    if jsonb_typeof(coalesce(item->'modifiers', '[]'::jsonb)) = 'array' then
      for modifier in select value from jsonb_array_elements(item->'modifiers')
      loop
        item_modifier_id := case
          when coalesce(modifier->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (modifier->>'id')::uuid
          else null
        end;

        if item_modifier_id is not null then
          -- Usar precio del modificador desde BD
          select coalesce(m.price_delta, 0) into v_db_modifier_delta
          from public.product_modifiers m
          where m.id = item_modifier_id;

          if found then
            item_modifiers_total := item_modifiers_total + v_db_modifier_delta;
          end if;
          -- Si no se encuentra el modificador, se ignora (precio 0)
        end if;
      end loop;
    end if;

    item_subtotal := (item_unit_price + item_modifiers_total) * item_quantity;
    subtotal := subtotal + item_subtotal;
  end loop;

  total := greatest(subtotal + delivery_fee, 0);

  -- ── Estimación de tiempo ───────────────────────────────────────────

  select count(*)
  into pending_orders
  from public.orders
  where status in ('pendiente', 'en_preparacion')
    and created_at >= now() - interval '12 hours';

  computed_minutes := computed_minutes + (pending_orders * per_pending_order_minutes);
  estimated_ready_at := timezone('utc', now()) + make_interval(mins => computed_minutes);

  -- ── Cliente ────────────────────────────────────────────────────────

  select *
  into customer_row
  from public.customers
  where phone = customer_phone
  limit 1;

  if customer_row.id is null then
    insert into public.customers (full_name, phone)
    values (customer_name, customer_phone)
    returning * into customer_row;
  else
    update public.customers
    set full_name = customer_name
    where id = customer_row.id
    returning * into customer_row;
  end if;

  customer_id := customer_row.id;

  -- ── Dirección de despacho ──────────────────────────────────────────

  if order_type = 'despacho' then
    select id into delivery_address_id
    from public.customer_addresses address
    where address.customer_id = customer_row.id
      and address.street = address_street
      and address.district = address_district
    limit 1;

    if delivery_address_id is null then
      insert into public.customer_addresses (
        customer_id, label, street, district, reference, is_default
      )
      values (
        customer_row.id,
        address_label,
        address_street,
        address_district,
        address_reference,
        not exists (
          select 1 from public.customer_addresses existing_address
          where existing_address.customer_id = customer_row.id
        )
      )
      returning id into delivery_address_id;
    end if;
  end if;

  -- ── Pago ───────────────────────────────────────────────────────────

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

  -- ── Insertar orden ─────────────────────────────────────────────────

  insert into public.orders (
    source, type, status, payment_method,
    subtotal, discount_amount, promotion_amount,
    delivery_fee, extra_charges, total, notes,
    cashier_id, customer_id, delivery_address_id,
    estimated_ready_at, customer_phone_snapshot, customer_name_snapshot
  )
  values (
    order_source, order_type, 'pendiente', payment_method,
    subtotal + delivery_fee, 0, 0,
    delivery_fee, '[]'::jsonb, total, notes,
    input_cashier_id, customer_id, delivery_address_id,
    estimated_ready_at, customer_phone, customer_name
  )
  returning * into order_row;

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

  -- ── Insertar items con precios de BD ───────────────────────────────

  for item in select value from jsonb_array_elements(cart)
  loop
    item_quantity := least(greatest(coalesce((item->>'quantity')::numeric, 1), 1), 100);

    item_variant_id := case
      when coalesce(item->>'variantId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (item->>'variantId')::uuid
      else null
    end;

    v_db_item_price := null;

    if item_variant_id is not null then
      select v.price into v_db_item_price
      from public.product_variants v
      where v.id = item_variant_id
        and v.product_id = (item->>'productId')::uuid;
    end if;

    if v_db_item_price is null then
      select p.base_price into v_db_item_price
      from public.products p
      where p.id = (item->>'productId')::uuid
        and p.status = 'activo';
    end if;

    if v_db_item_price is null then
      raise exception 'Producto no disponible o inactivo.';
    end if;

    item_unit_price := v_db_item_price;
    item_modifiers_total := 0;

    if jsonb_typeof(coalesce(item->'modifiers', '[]'::jsonb)) = 'array' then
      for modifier in select value from jsonb_array_elements(item->'modifiers')
      loop
        item_modifier_id := case
          when coalesce(modifier->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (modifier->>'id')::uuid
          else null
        end;

        if item_modifier_id is not null then
          select coalesce(m.price_delta, 0) into v_db_modifier_delta
          from public.product_modifiers m
          where m.id = item_modifier_id;

          if found then
            item_modifiers_total := item_modifiers_total + v_db_modifier_delta;
          end if;
        end if;
      end loop;
    end if;

    item_subtotal := (item_unit_price + item_modifiers_total) * item_quantity;

    insert into public.order_items (
      order_id, product_id, variant_id,
      quantity, unit_price, subtotal, notes
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
    returning * into order_item_row;

    if jsonb_typeof(coalesce(item->'modifiers', '[]'::jsonb)) = 'array' then
      for modifier in select value from jsonb_array_elements(item->'modifiers')
      loop
        item_modifier_id := case
          when coalesce(modifier->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (modifier->>'id')::uuid
          else null
        end;

        if item_modifier_id is not null then
          select coalesce(m.price_delta, 0) into v_db_modifier_delta
          from public.product_modifiers m
          where m.id = item_modifier_id;

          if not found then
            v_db_modifier_delta := 0;
          end if;

          insert into public.order_item_modifiers (
            order_item_id, modifier_id, modifier_name_snapshot, price_delta
          )
          values (
            order_item_row.id,
            item_modifier_id,
            coalesce(nullif(trim(modifier->>'name'), ''), 'Modificador'),
            v_db_modifier_delta
          );
        end if;
      end loop;
    end if;
  end loop;

  -- ── Ticket de cocina y despacho ────────────────────────────────────

  insert into public.kitchen_tickets (order_id, status)
  values (order_row.id, 'pendiente');

  if order_type = 'despacho' then
    insert into public.dispatch_orders (
      order_id, status, zone_id,
      contact_name, contact_phone,
      delivery_fee, estimated_delivery_at
    )
    values (
      order_row.id, 'pendiente', dispatch_zone.id,
      customer_name, customer_phone,
      delivery_fee, estimated_ready_at
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

grant execute on function public.create_storefront_order(jsonb) to anon, authenticated;

-- ── 5. get_storefront_customer_profile() — respuesta consistente ─────
-- Antes: retornaba null cuando no existía el cliente, lo que permitía
-- distinguir mediante timing si un teléfono estaba registrado.
-- Fix: respuesta vacía estructurada siempre del mismo tipo.

create or replace function public.get_storefront_customer_profile(customer_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text := regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g');
  customer_row public.customers%rowtype;
  empty_response jsonb := jsonb_build_object(
    'customer', null,
    'addresses', '[]'::jsonb,
    'recentOrders', '[]'::jsonb,
    'recommendedProducts', '[]'::jsonb
  );
begin
  -- Validar longitud de teléfono (mínimo 8, máximo 15 dígitos)
  if length(normalized_phone) < 8 or length(normalized_phone) > 15 then
    return empty_response;
  end if;

  select *
  into customer_row
  from public.customers
  where phone = normalized_phone
  limit 1;

  -- Respuesta vacía consistente si no se encuentra (mismo formato que "encontrado")
  if customer_row.id is null then
    return empty_response;
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

grant execute on function public.get_storefront_customer_profile(text) to anon, authenticated;

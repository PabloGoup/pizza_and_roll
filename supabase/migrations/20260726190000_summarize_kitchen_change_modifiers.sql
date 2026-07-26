create or replace function public.kitchen_order_print_payload(p_order_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'number', o.number,
    'source', o.source,
    'type', o.type,
    'status', o.status,
    'notes', o.notes,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'cashierName', coalesce(p.full_name, 'Sin asignar'),
    'customerName', coalesce(o.customer_name_snapshot, c.full_name),
    'customerPhone', coalesce(o.customer_phone_snapshot, c.phone),
    'deliveryAddress', case
      when a.id is null then null
      else jsonb_build_object(
        'label', a.label,
        'street', a.street,
        'district', a.district,
        'reference', a.reference
      )
    end,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'productName', product.name,
          'categoryName', category.name,
          'variantName', variant.name,
          'quantity', oi.quantity,
          'notes', oi.notes,
          'modifiers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'name', printable_modifier.name,
                'quantity', printable_modifier.quantity
              )
              order by printable_modifier.sort_order
            )
            from (
              select
                oim.id::text as sort_order,
                oim.modifier_name_snapshot as name,
                1 as quantity
              from public.order_item_modifiers oim
              where oim.order_item_id = oi.id
                and lower(trim(oim.modifier_name_snapshot)) not like 'agregar cambio%'

              union all

              select
                'zzzzzzzz' as sort_order,
                'CAMBIOS: ' || sum(
                  coalesce(
                    nullif(
                      substring(oim.modifier_name_snapshot from '[xX][[:space:]]*([0-9]+)'),
                      ''
                    )::integer,
                    1
                  )
                )::text as name,
                1 as quantity
              from public.order_item_modifiers oim
              where oim.order_item_id = oi.id
                and lower(trim(oim.modifier_name_snapshot)) like 'agregar cambio%'
              having count(*) > 0
            ) printable_modifier
          ), '[]'::jsonb)
        )
        order by oi.id
      )
      from public.order_items oi
      join public.products product on product.id = oi.product_id
      join public.product_categories category on category.id = product.category_id
      left join public.product_variants variant on variant.id = oi.variant_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  left join public.profiles p on p.id = o.cashier_id
  left join public.customers c on c.id = o.customer_id
  left join public.customer_addresses a on a.id = o.delivery_address_id
  where o.id = p_order_id
$$;

revoke execute on function public.kitchen_order_print_payload(uuid) from public;

notify pgrst, 'reload schema';

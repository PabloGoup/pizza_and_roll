-- Auditoría de esquema para comparar el Supabase real
-- contra el esquema esperado por este proyecto.
-- Ejecuta cada bloque por separado en SQL Editor.

-- 1) Inventario completo de tablas y columnas actuales
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position;

-- 2) Tablas faltantes y sobrantes
with expected_tables(table_name) as (
  values
    ('profiles'),
    ('audit_logs'),
    ('product_categories'),
    ('products'),
    ('product_variants'),
    ('product_modifier_groups'),
    ('product_modifiers'),
    ('customers'),
    ('customer_addresses'),
    ('orders'),
    ('order_payments'),
    ('order_items'),
    ('order_item_modifiers'),
    ('kitchen_tickets'),
    ('dispatch_orders'),
    ('cash_sessions'),
    ('cash_movements'),
    ('promotions'),
    ('ingredients'),
    ('recipes'),
    ('recipe_items'),
    ('inventory_movements'),
    ('suppliers'),
    ('purchases'),
    ('purchase_items'),
    ('employees'),
    ('employee_adjustments'),
    ('payroll_runs'),
    ('payroll_entries')
),
actual_tables as (
  select t.table_name
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
)
select
  case
    when e.table_name is null then 'sobra_en_bd'
    when a.table_name is null then 'falta_en_bd'
  end as estado,
  coalesce(e.table_name, a.table_name) as table_name
from expected_tables e
full join actual_tables a using (table_name)
where e.table_name is null or a.table_name is null
order by estado, table_name;

-- 3) Columnas faltantes y sobrantes por tabla
with expected_json(schema_map) as (
  values (
    '{
      "profiles": ["id","email","full_name","role","is_active","avatar_url","created_at","updated_at"],
      "audit_logs": ["id","module","action","detail","performed_by","previous_value","new_value","reason","created_at"],
      "product_categories": ["id","name","color","sort_order","created_at"],
      "products": ["id","category_id","sort_order","name","description","image_url","base_price","cost","is_favorite","status","tags","created_at","updated_at"],
      "product_variants": ["id","product_id","name","sku","price","cost","is_default"],
      "product_modifier_groups": ["id","product_id","name","min_select","max_select"],
      "product_modifiers": ["id","modifier_group_id","name","price_delta","default_included"],
      "customers": ["id","full_name","phone","notes","created_at","updated_at"],
      "customer_addresses": ["id","customer_id","label","street","district","reference","is_default"],
      "orders": ["id","number","type","status","payment_method","subtotal","discount_amount","promotion_amount","delivery_fee","extra_charges","total","notes","cashier_id","customer_id","delivery_address_id","cancellation_reason","created_at","updated_at"],
      "order_payments": ["id","order_id","method","amount"],
      "order_items": ["id","order_id","product_id","variant_id","quantity","unit_price","subtotal","notes"],
      "order_item_modifiers": ["id","order_item_id","modifier_id","modifier_name_snapshot","price_delta"],
      "kitchen_tickets": ["id","order_id","status","printed_at","created_at","updated_at"],
      "dispatch_orders": ["id","order_id","status","contact_name","contact_phone","created_at","updated_at"],
      "cash_sessions": ["id","cashier_id","opening_amount","expected_amount","expected_cash_sales_amount","expected_card_amount","expected_transfer_amount","counted_amount","counted_card_amount","counted_transfer_amount","difference_amount","difference_card_amount","difference_transfer_amount","notes","status","opened_at","closed_at"],
      "cash_movements": ["id","session_id","type","amount","reason","performed_by","linked_order_id","created_at"],
      "promotions": ["id","name","description","type","value","start_at","end_at","is_active","rules"],
      "ingredients": ["id","name","unit","current_stock","minimum_stock","average_cost","created_at","updated_at"],
      "recipes": ["id","product_id","expected_margin","created_at","updated_at"],
      "recipe_items": ["id","recipe_id","ingredient_id","quantity","unit_cost"],
      "inventory_movements": ["id","ingredient_id","type","quantity","unit_cost","reference_table","reference_id","notes","performed_by","created_at"],
      "suppliers": ["id","name","phone","email","contact_name","notes","created_at"],
      "purchases": ["id","supplier_id","purchase_date","payment_method","total_amount","document_url","created_by","created_at"],
      "purchase_items": ["id","purchase_id","ingredient_id","quantity","unit_cost","line_total"],
      "employees": ["id","full_name","role_name","hire_date","base_salary","phone","email","is_active","created_at","updated_at"],
      "employee_adjustments": ["id","employee_id","type","amount","description","effective_date","created_by","created_at"],
      "payroll_runs": ["id","period_label","payment_date","notes","created_by","created_at"],
      "payroll_entries": ["id","payroll_run_id","employee_id","gross_salary","bonuses","discounts","advances","net_salary"]
    }'::jsonb
  )
),
expected_columns as (
  select
    entry.key as table_name,
    value.value #>> '{}' as column_name
  from expected_json e
  cross join lateral jsonb_each(e.schema_map) as entry(key, value)
  cross join lateral jsonb_array_elements(entry.value) as value(value)
),
actual_columns as (
  select c.table_name, c.column_name
  from information_schema.columns c
  where c.table_schema = 'public'
)
select
  case
    when e.column_name is null then 'sobra_en_bd'
    when a.column_name is null then 'falta_en_bd'
  end as estado,
  coalesce(e.table_name, a.table_name) as table_name,
  coalesce(e.column_name, a.column_name) as column_name
from expected_columns e
full join actual_columns a
  on e.table_name = a.table_name
 and e.column_name = a.column_name
where e.column_name is null or a.column_name is null
order by table_name, estado, column_name;

-- 4) Tipos / nullability / defaults actuales para revisar diferencias finas
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'profiles',
    'audit_logs',
    'product_categories',
    'products',
    'product_variants',
    'product_modifier_groups',
    'product_modifiers',
    'customers',
    'customer_addresses',
    'orders',
    'order_payments',
    'order_items',
    'order_item_modifiers',
    'kitchen_tickets',
    'dispatch_orders',
    'cash_sessions',
    'cash_movements',
    'promotions',
    'ingredients',
    'recipes',
    'recipe_items',
    'inventory_movements',
    'suppliers',
    'purchases',
    'purchase_items',
    'employees',
    'employee_adjustments',
    'payroll_runs',
    'payroll_entries'
  )
order by c.table_name, c.ordinal_position;

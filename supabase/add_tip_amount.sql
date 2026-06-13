-- Propinas (tips) en ventas POS.
-- Agrega la columna tip_amount a orders. El código tiene fallback para
-- funcionar aunque esta columna no exista todavía, pero para PERSISTIR la
-- propina debes ejecutar esta migración en el SQL Editor de Supabase.

alter table public.orders
  add column if not exists tip_amount numeric(12, 2) not null default 0;

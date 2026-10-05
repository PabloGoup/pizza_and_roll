-- An order can have an address before the cashier knows the customer's identity.
-- Existing foreign keys, staff RLS and order/address relationships remain intact.
alter table public.customer_addresses alter column customer_id drop not null;
notify pgrst, 'reload schema';

alter table public.cash_sessions
add column if not exists expected_cash_sales_amount numeric(12, 2) not null default 0,
add column if not exists expected_card_amount numeric(12, 2) not null default 0,
add column if not exists expected_transfer_amount numeric(12, 2) not null default 0,
add column if not exists counted_card_amount numeric(12, 2),
add column if not exists counted_transfer_amount numeric(12, 2),
add column if not exists difference_card_amount numeric(12, 2),
add column if not exists difference_transfer_amount numeric(12, 2);

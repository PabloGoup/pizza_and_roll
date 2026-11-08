-- Contact details confirmed by the store owner for customer receipts.
begin;

alter table public.store_settings
  add column if not exists store_address text;

update public.store_settings
set store_address = 'Recoleta 5726, Huechuraba',
    support_phone = '+569 4099 9386'
where id = (
  select id
  from public.store_settings
  order by created_at, id
  limit 1
);

insert into public.store_settings (store_name, store_address, support_phone)
select 'Poke n Roll', 'Recoleta 5726, Huechuraba', '+569 4099 9386'
where not exists (select 1 from public.store_settings);

notify pgrst, 'reload schema';
commit;

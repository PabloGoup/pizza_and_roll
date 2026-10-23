create or replace function public.list_active_kitchen_orders()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role::text in ('administrador','cajero','cocina')) then raise exception 'Sin permiso para consultar cocina'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'ticket_id',k.id,'ticket_status',k.status,'ticket_created_at',k.created_at,'order_id',o.id,'order_number',o.number,
   'source',o.source,'type',o.type,'notes',o.notes,'customer_name',o.customer_name_snapshot,'order_created_at',o.created_at,'estimated_ready_at',o.estimated_ready_at,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'variant_id',i.variant_id,'quantity',i.quantity,'notes',i.notes,'product_name',p.name,'variant_name',v.name,
     'modifiers',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'modifier_name_snapshot',m.modifier_name_snapshot,'price_delta',m.price_delta) order by m.id) from public.order_item_modifiers m where m.order_item_id=i.id),'[]'::jsonb)) order by i.id)
     from public.order_items i join public.products p on p.id=i.product_id left join public.product_variants v on v.id=i.variant_id where i.order_id=o.id),'[]'::jsonb)) order by k.created_at,k.id)
   from public.kitchen_tickets k join public.orders o on o.id=k.order_id where k.status in ('pendiente','en_preparacion') and k.dismissed_at is null),'[]'::jsonb);
end;
$$;
revoke all on function public.list_active_kitchen_orders() from public,anon;
grant execute on function public.list_active_kitchen_orders() to authenticated;
-- Events must be published; otherwise every new ticket waits for fallback polling.
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kitchen_tickets') then
   alter publication supabase_realtime add table public.kitchen_tickets;
 end if;
end;
$$;
notify pgrst,'reload schema';

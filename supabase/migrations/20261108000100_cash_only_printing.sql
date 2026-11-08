-- Deploy with the updated print agent. No historical orders are backfilled.
begin;
alter table public.print_agents add column if not exists supports_cash_documents boolean not null default false;
alter table public.print_jobs alter column order_id drop not null;
alter table public.print_jobs add column if not exists document_payload jsonb;
alter table public.print_jobs drop constraint if exists print_jobs_job_type_check;
alter table public.print_jobs add constraint print_jobs_job_type_check check(job_type in ('new','revision','reprint','cash_report'));
alter table public.print_agents alter column font_size set default 'compact';
update public.print_agents set font_size='compact', config_version=config_version+1;
drop policy if exists "print jobs staff enqueue" on public.print_jobs;
drop trigger if exists kitchen_ticket_enqueue_print on public.kitchen_tickets;
-- Retain queued rows for audit, but do not send old kitchen slips to the printer.
update public.print_jobs set status='failed', last_error='Retirado por cambio a impresora de caja' where status in ('pending','processing');
create or replace function public.cash_order_print_payload(p_order_id uuid)
returns jsonb language sql security definer stable set search_path=public as $$
 select public.kitchen_order_print_payload(o.id) || jsonb_build_object(
 'documentType','receipt',
 'store', (select jsonb_build_object('name',s.store_name,'phone',s.support_phone,'address',coalesce(to_jsonb(s)->>'address',to_jsonb(s)->>'store_address')) from store_settings s order by s.created_at limit 1),
 'subtotal',o.subtotal,'discountAmount',o.discount_amount,'promotionAmount',o.promotion_amount,
 'deliveryFee',o.delivery_fee,'extraCharges',o.extra_charges,'tipAmount',coalesce((to_jsonb(o)->>'tip_amount')::numeric,0),'total',o.total,'paymentMethod',o.payment_method,
 'items',coalesce((select jsonb_agg(jsonb_build_object('productName',pr.name,'variantName',v.name,'quantity',i.quantity,'subtotal',i.subtotal,'notes',i.notes,'modifiers',coalesce((select jsonb_agg(jsonb_build_object('name',m.modifier_name_snapshot,'priceDelta',m.price_delta)) from order_item_modifiers m where m.order_item_id=i.id),'[]'::jsonb)) order by i.id) from order_items i join products pr on pr.id=i.product_id left join product_variants v on v.id=i.variant_id where i.order_id=o.id),'[]'::jsonb))
 from orders o where o.id=p_order_id
$$;
create or replace function public.enqueue_kitchen_print(
  p_order_id uuid,
  p_job_type text,
  p_dedupe_key text default null,
  p_agent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_job_type not in ('new', 'revision', 'reprint') then
    raise exception 'Invalid print job type';
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order not found';
  end if;

  if p_agent_id is not null and not exists (
    select 1
    from public.print_agents
    where id = p_agent_id and is_active and printer_name is not null
  ) then
    raise exception 'Selected print computer is not available';
  end if;

  if p_job_type='reprint' and not exists(select 1 from orders where id=p_order_id and status in ('listo','entregado')) then raise exception 'Pedido aun no terminado por cocina'; end if;
  v_key := coalesce(
    nullif(trim(p_dedupe_key), ''),
    p_job_type || ':' || p_order_id::text || ':' || gen_random_uuid()::text
  );

  insert into public.print_jobs (
    order_id,
    job_type,
    dedupe_key,
    target_agent_id,
    requested_by
  )
  values (
    p_order_id,
    p_job_type,
    v_key,
    coalesce(
      p_agent_id,
      (
        select id
        from public.print_agents
        where is_active and printer_name is not null
        order by last_seen_at desc nulls last, created_at
        limit 1
      )
    ),
    auth.uid()
  )
  on conflict (dedupe_key) do update
    set dedupe_key = excluded.dedupe_key,
        target_agent_id = coalesce(excluded.target_agent_id, print_jobs.target_agent_id)
  returning id into v_job_id;

  update public.print_jobs set available_at = case when (select status from public.orders where id=p_order_id) in ('listo','entregado') then now() else 'infinity'::timestamptz end where id=v_job_id;
  return v_job_id;
end;
$$;

create or replace function public.hold_cash_print_until_ready()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.order_id is not null and new.status='pending' and not exists(select 1 from orders where id=new.order_id and status in ('listo','entregado')) then new.available_at='infinity'::timestamptz; end if;
 return new;
end $$;
drop trigger if exists hold_cash_print_until_ready on public.print_jobs;
create trigger hold_cash_print_until_ready before insert or update on public.print_jobs for each row execute function public.hold_cash_print_until_ready();
create or replace function public.enqueue_ready_cash_receipt()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='listo' and old.status is distinct from new.status then
   insert into print_jobs(order_id,job_type,dedupe_key,document_payload,available_at)
   values(new.id,'new','new:'||new.id::text,public.cash_order_print_payload(new.id),now())
   on conflict(dedupe_key) do update set document_payload=excluded.document_payload, available_at=now(), status='pending', attempts=0
   where print_jobs.printed_at is null;
 end if;
 return new;
end $$;
drop trigger if exists order_ready_cash_receipt on public.orders;
create trigger order_ready_cash_receipt after update of status on public.orders for each row execute function public.enqueue_ready_cash_receipt();
create or replace function public.claim_print_jobs(
  p_agent_name text,
  p_agent_token text,
  p_limit integer default 3
)
returns table (
  job_id uuid,
  job_type text,
  attempt_number integer,
  order_payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_id uuid;
begin
  v_agent_id := public.validate_print_agent(p_agent_name, p_agent_token);
  if v_agent_id is null then
    raise exception 'Invalid print agent credentials';
  end if;

  update public.print_agents
  set last_seen_at = timezone('utc', now())
  where id = v_agent_id;

  return query
  with candidates as (
    select j.id
    from public.print_jobs j
    where j.status in ('pending', 'processing')
      and exists(select 1 from print_agents a where a.id=v_agent_id and a.supports_cash_documents)
      and j.job_type <> 'revision'
      and (j.order_id is null or exists(select 1 from orders o where o.id=j.order_id and o.status in ('listo','entregado')))
      and (
        j.target_agent_id = v_agent_id
        or (
          j.target_agent_id is null
          and v_agent_id = (
            select id
            from public.print_agents
            where is_active and printer_name is not null
            order by last_seen_at desc nulls last, created_at
            limit 1
          )
        )
      )
      and j.available_at <= timezone('utc', now())
      and j.attempts < j.max_attempts
      and (
        j.status = 'pending'
        or j.locked_at < timezone('utc', now()) - interval '2 minutes'
      )
    order by j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 10))
  ),
  claimed as (
    update public.print_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        locked_at = timezone('utc', now()),
        locked_by = v_agent_id,
        last_error = null
    from candidates c
    where j.id = c.id
    returning j.id, j.job_type, j.attempts, j.order_id, j.document_payload
  )
  select
    c.id,
    c.job_type,
    c.attempts,
    coalesce(c.document_payload, public.cash_order_print_payload(c.order_id))
  from claimed c;
end;
$$;
create or replace function public.complete_print_job(
  p_agent_name text,
  p_agent_token text,
  p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_id uuid;
  v_order_id uuid;
begin
  v_agent_id := public.validate_print_agent(p_agent_name, p_agent_token);
  if v_agent_id is null then
    raise exception 'Invalid print agent credentials';
  end if;

  update public.print_jobs
  set status = 'printed',
      printed_at = timezone('utc', now()),
      locked_at = null,
      last_error = null
  where id = p_job_id
    and locked_by = v_agent_id
    and status = 'processing'
  returning order_id into v_order_id;

  if not found then
    raise exception 'Print job is not owned by this agent';
  end if;


end;
$$;

create or replace function public.enqueue_cash_report(p_payload jsonb, p_agent_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare job uuid;
begin
 if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role::text in ('administrador','cajero')) then raise exception 'Sin permiso para imprimir reportes'; end if;
 if jsonb_typeof(p_payload->'lines') is distinct from 'array' or octet_length(p_payload::text)>1000000 then raise exception 'Reporte invalido'; end if;
 if p_agent_id is not null and not exists(select 1 from print_agents where id=p_agent_id and is_active and printer_name is not null) then raise exception 'Impresora no disponible'; end if;
 insert into print_jobs(job_type,dedupe_key,target_agent_id,requested_by,document_payload) values('cash_report','report:'||gen_random_uuid(),p_agent_id,auth.uid(),p_payload||jsonb_build_object('documentType','cash_report')) returning id into job;
 return job;
end $$;
revoke all on function public.cash_order_print_payload(uuid) from public;
revoke all on function public.enqueue_ready_cash_receipt() from public;
revoke all on function public.enqueue_cash_report(jsonb,uuid) from public;
grant execute on function public.enqueue_cash_report(jsonb,uuid) to authenticated;

-- Old agents keep reporting health, but only upgraded agents can claim cash documents.
drop function if exists public.report_print_agent(text,text,text,text,text,jsonb);
create or replace function public.report_print_agent(
  p_agent_name text,
  p_agent_token text,
  p_platform text,
  p_hostname text,
  p_preferred_printer text,
  p_available_printers jsonb,
  p_supported_documents text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_id uuid;
  v_config jsonb;
begin
  v_agent_id := public.validate_print_agent(p_agent_name, p_agent_token);
  if v_agent_id is null then
    raise exception 'Invalid print agent credentials';
  end if;

  update public.print_agents
  set supports_cash_documents = coalesce(p_supported_documents @> array['cash-v1'], false),
      platform = left(coalesce(p_platform, ''), 50),
      hostname = left(coalesce(p_hostname, ''), 255),
      available_printers = case
        when jsonb_typeof(p_available_printers) = 'array' then p_available_printers
        else '[]'::jsonb
      end,
      printer_name = coalesce(
        printer_name,
        nullif(trim(p_preferred_printer), '')
      ),
      last_seen_at = timezone('utc', now())
  where id = v_agent_id
  returning jsonb_build_object(
    'id', id,
    'isActive', is_active,
    'printerName', printer_name,
    'paperWidth', paper_width,
    'charactersPerLine', characters_per_line,
    'fontSize', font_size,
    'feedLines', feed_lines,
    'configVersion', config_version
  ) into v_config;

  return v_config;
end;
$$;
create or replace function public.get_print_control_panel()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return jsonb_build_object(
    'agents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'isActive', a.is_active,
          'supportsCashDocuments', a.supports_cash_documents,
          'isOnline', a.last_seen_at >= timezone('utc', now()) - interval '20 seconds',
          'lastSeenAt', a.last_seen_at,
          'platform', a.platform,
          'hostname', a.hostname,
          'printerName', a.printer_name,
          'availablePrinters', a.available_printers,
          'paperWidth', a.paper_width,
          'charactersPerLine', a.characters_per_line,
          'fontSize', a.font_size,
          'feedLines', a.feed_lines,
          'configVersion', a.config_version
        )
        order by a.name
      )
      from public.print_agents a
    ), '[]'::jsonb),
    'queue', jsonb_build_object(
      'pending', (select count(*) from public.print_jobs where status = 'pending'),
      'processing', (select count(*) from public.print_jobs where status = 'processing'),
      'failed', (select count(*) from public.print_jobs where status = 'failed')
    )
  );
end;
$$;
revoke all on function public.report_print_agent(text,text,text,text,text,jsonb,text[]) from public;
grant execute on function public.report_print_agent(text,text,text,text,text,jsonb,text[]) to anon, authenticated;

notify pgrst,'reload schema';
commit;

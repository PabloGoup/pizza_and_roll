-- Cola durable para impresión de comandas mediante un agente local.
-- Ejecutar una vez en Supabase SQL Editor.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.print_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  token_hash text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.print_agent_pairings (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.print_agents
  add column if not exists platform text,
  add column if not exists hostname text,
  add column if not exists printer_name text,
  add column if not exists available_printers jsonb not null default '[]'::jsonb,
  add column if not exists paper_width integer not null default 58,
  add column if not exists characters_per_line integer not null default 32,
  add column if not exists font_size text not null default 'large',
  add column if not exists feed_lines integer not null default 6,
  add column if not exists config_version bigint not null default 1;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  job_type text not null check (job_type in ('new', 'revision', 'reprint')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'printed', 'failed')),
  dedupe_key text not null unique,
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by uuid references public.print_agents(id) on delete set null,
  printed_at timestamptz,
  last_error text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.print_jobs
  add column if not exists target_agent_id uuid
    references public.print_agents(id) on delete set null;

drop index if exists public.idx_print_jobs_claim;
create index idx_print_jobs_claim
  on public.print_jobs(target_agent_id, status, available_at, created_at);
create index if not exists idx_print_jobs_order
  on public.print_jobs(order_id, created_at desc);

alter table public.print_agents enable row level security;
alter table public.print_agent_pairings enable row level security;
alter table public.print_jobs enable row level security;

drop policy if exists "print jobs staff read" on public.print_jobs;
create policy "print jobs staff read" on public.print_jobs
for select to authenticated
using (true);

drop policy if exists "print jobs staff enqueue" on public.print_jobs;
create policy "print jobs staff enqueue" on public.print_jobs
for insert to authenticated
with check (requested_by = auth.uid());

create or replace function public.touch_print_queue_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists print_agents_touch_updated_at on public.print_agents;
create trigger print_agents_touch_updated_at
before update on public.print_agents
for each row execute procedure public.touch_print_queue_updated_at();

drop trigger if exists print_jobs_touch_updated_at on public.print_jobs;
create trigger print_jobs_touch_updated_at
before update on public.print_jobs
for each row execute procedure public.touch_print_queue_updated_at();

create or replace function public.enqueue_new_kitchen_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.print_jobs (
    order_id,
    job_type,
    dedupe_key,
    target_agent_id,
    available_at,
    requested_by
  )
  values (
    new.order_id,
    'new',
    'new:' || new.order_id::text,
    null,
    timezone('utc', now()) + interval '1 second',
    auth.uid()
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists kitchen_ticket_enqueue_print on public.kitchen_tickets;
create trigger kitchen_ticket_enqueue_print
after insert on public.kitchen_tickets
for each row execute procedure public.enqueue_new_kitchen_ticket();

drop function if exists public.enqueue_kitchen_print(uuid, text, text);
drop function if exists public.enqueue_kitchen_print(uuid, text, text, uuid);

create function public.enqueue_kitchen_print(
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

  return v_job_id;
end;
$$;

create or replace function public.create_print_agent(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
begin
  if auth.uid() is null then
    if session_user not in ('postgres', 'supabase_admin') then
      raise exception 'Administrator permissions required';
    end if;
  elsif not public.is_admin() then
    raise exception 'Administrator permissions required';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.print_agents (name, token_hash, is_active)
  values (
    trim(p_name),
    extensions.crypt(v_token, extensions.gen_salt('bf')),
    true
  )
  on conflict (name) do update
    set token_hash = excluded.token_hash,
        is_active = true,
        last_seen_at = null,
        printer_name = null,
        available_printers = '[]'::jsonb,
        config_version = print_agents.config_version + 1
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'name', trim(p_name),
    'token', v_token
  );
end;
$$;

create or replace function public.create_print_agent_pairing(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_expires_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Administrator permissions required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Computer name is required';
  end if;

  v_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  v_expires_at := timezone('utc', now()) + interval '15 minutes';

  insert into public.print_agent_pairings (
    agent_name,
    code_hash,
    expires_at,
    created_by
  )
  values (
    left(trim(p_name), 120),
    extensions.digest(v_code, 'sha256'),
    v_expires_at,
    auth.uid()
  );

  return jsonb_build_object(
    'code', v_code,
    'name', left(trim(p_name), 120),
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.claim_print_agent_pairing(
  p_code text,
  p_hostname text,
  p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pairing public.print_agent_pairings%rowtype;
  v_token text;
  v_agent_id uuid;
begin
  select *
  into v_pairing
  from public.print_agent_pairings
  where code_hash = extensions.digest(upper(trim(p_code)), 'sha256')
    and claimed_at is null
    and expires_at > timezone('utc', now())
  for update
  limit 1;

  if v_pairing.id is null then
    raise exception 'Invalid or expired pairing code';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.print_agents (
    name,
    token_hash,
    is_active,
    hostname,
    platform,
    last_seen_at
  )
  values (
    v_pairing.agent_name,
    extensions.crypt(v_token, extensions.gen_salt('bf')),
    true,
    left(coalesce(p_hostname, ''), 255),
    left(coalesce(p_platform, ''), 50),
    timezone('utc', now())
  )
  on conflict (name) do update
    set token_hash = excluded.token_hash,
        is_active = true,
        hostname = excluded.hostname,
        platform = excluded.platform,
        printer_name = null,
        available_printers = '[]'::jsonb,
        last_seen_at = excluded.last_seen_at,
        config_version = print_agents.config_version + 1
  returning id into v_agent_id;

  update public.print_agent_pairings
  set claimed_at = timezone('utc', now())
  where id = v_pairing.id;

  return jsonb_build_object(
    'id', v_agent_id,
    'name', v_pairing.agent_name,
    'token', v_token
  );
end;
$$;

create or replace function public.validate_print_agent(
  p_agent_name text,
  p_agent_token text
)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from public.print_agents
  where name = p_agent_name
    and is_active
    and token_hash = extensions.crypt(p_agent_token, token_hash)
  limit 1
$$;

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
                'name', oim.modifier_name_snapshot,
                'quantity', 1
              )
              order by oim.id
            )
            from public.order_item_modifiers oim
            where oim.order_item_id = oi.id
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
    returning j.id, j.job_type, j.attempts, j.order_id
  )
  select
    c.id,
    c.job_type,
    c.attempts,
    public.kitchen_order_print_payload(c.order_id)
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

  if v_order_id is null then
    raise exception 'Print job is not owned by this agent';
  end if;

  update public.kitchen_tickets
  set printed_at = timezone('utc', now())
  where order_id = v_order_id;
end;
$$;

create or replace function public.fail_print_job(
  p_agent_name text,
  p_agent_token text,
  p_job_id uuid,
  p_error text
)
returns void
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

  update public.print_jobs
  set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
      available_at = timezone('utc', now())
        + make_interval(secs => least(60, greatest(2, power(2, attempts)::integer))),
      locked_at = null,
      locked_by = null,
      last_error = left(coalesce(p_error, 'Unknown print error'), 2000)
  where id = p_job_id
    and locked_by = v_agent_id
    and status = 'processing';
end;
$$;

drop function if exists public.report_print_agent(text, text, text, text, jsonb);

create or replace function public.report_print_agent(
  p_agent_name text,
  p_agent_token text,
  p_platform text,
  p_hostname text,
  p_preferred_printer text,
  p_available_printers jsonb
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
  set platform = left(coalesce(p_platform, ''), 50),
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

create or replace function public.update_print_agent_settings(
  p_agent_id uuid,
  p_printer_name text,
  p_paper_width integer,
  p_characters_per_line integer,
  p_font_size text,
  p_feed_lines integer,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator permissions required';
  end if;

  if p_paper_width not in (58, 80) then
    raise exception 'Paper width must be 58 or 80 mm';
  end if;
  if p_characters_per_line < 16 or p_characters_per_line > 64 then
    raise exception 'Characters per line must be between 16 and 64';
  end if;
  if p_font_size not in ('compact', 'normal', 'large') then
    raise exception 'Invalid font size';
  end if;
  if p_feed_lines < 1 or p_feed_lines > 12 then
    raise exception 'Feed lines must be between 1 and 12';
  end if;

  update public.print_agents
  set printer_name = nullif(trim(p_printer_name), ''),
      paper_width = p_paper_width,
      characters_per_line = p_characters_per_line,
      font_size = p_font_size,
      feed_lines = p_feed_lines,
      is_active = p_is_active,
      config_version = config_version + 1
  where id = p_agent_id;

  if not found then
    raise exception 'Print agent not found';
  end if;
end;
$$;

create or replace function public.deactivate_print_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator permissions required';
  end if;

  update public.print_agents
  set is_active = false,
      printer_name = null,
      config_version = config_version + 1
  where id = p_agent_id;

  if not found then
    raise exception 'Print agent not found';
  end if;
end;
$$;

grant execute on function public.create_print_agent(text) to authenticated;
grant execute on function public.create_print_agent_pairing(text) to authenticated;
grant execute on function public.claim_print_agent_pairing(text, text, text) to anon, authenticated;
grant execute on function public.enqueue_kitchen_print(uuid, text, text, uuid) to authenticated;
grant execute on function public.claim_print_jobs(text, text, integer) to anon, authenticated;
grant execute on function public.complete_print_job(text, text, uuid) to anon, authenticated;
grant execute on function public.fail_print_job(text, text, uuid, text) to anon, authenticated;
grant execute on function public.report_print_agent(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.get_print_control_panel() to authenticated;
grant execute on function public.update_print_agent_settings(uuid, text, integer, integer, text, integer, boolean) to authenticated;
grant execute on function public.deactivate_print_agent(uuid) to authenticated;

revoke execute on function public.validate_print_agent(text, text) from public;
revoke execute on function public.kitchen_order_print_payload(uuid) from public;

-- Fuerza a PostgREST a publicar inmediatamente las funciones nuevas.
notify pgrst, 'reload schema';

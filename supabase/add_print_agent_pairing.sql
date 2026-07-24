-- Vinculación gráfica para los instaladores de impresión de Windows y macOS.
-- Es seguro ejecutar este archivo más de una vez.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.print_agent_pairings (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.print_agent_pairings enable row level security;

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

grant execute on function public.create_print_agent_pairing(text) to authenticated;
grant execute on function public.claim_print_agent_pairing(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Durable requests: the OS queue is a separate system and must acknowledge cancellation.
begin;
create table public.print_queue_cancellations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.print_agents(id),
  printer_name text not null,
  job_ids uuid[],
  created_at timestamptz not null default now(),
  requested_by uuid references public.profiles(id),
  completed_at timestamptz,
  last_error text
);
create index print_queue_cancellations_pending on public.print_queue_cancellations(agent_id) where completed_at is null;
alter table public.print_queue_cancellations enable row level security;
create policy print_queue_cancellations_read on public.print_queue_cancellations for select to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and is_active and role::text in ('administrador','cajero')));
grant select on public.print_queue_cancellations to authenticated;

create or replace function public.cancel_print_jobs(p_job_ids uuid[] default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and is_active and role::text in ('administrador','cajero')) then
    raise exception 'Sin permiso para cancelar impresiones';
  end if;
  -- Snapshot the configured printer before changing locks. A global cancellation also
  -- reaches documents already accepted by Windows (database status printed).
  insert into print_queue_cancellations(agent_id,printer_name,job_ids,requested_by)
  select a.id,a.printer_name,p_job_ids,auth.uid() from print_agents a
  where nullif(a.printer_name,'') is not null and (a.platform='win32' or a.platform is null) and (p_job_ids is null or exists(
    select 1 from print_jobs j where j.id=any(p_job_ids)
    and (j.locked_by=a.id or j.target_agent_id=a.id or (j.locked_by is null and j.target_agent_id is null))
  ));
  update print_jobs set status='failed',last_error='Cancelado manualmente',locked_at=null,locked_by=null
  where status in ('pending','processing') and (p_job_ids is null or id=any(p_job_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function public.poll_print_cancellations(p_agent_name text,p_agent_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_agent uuid;
begin
  v_agent := validate_print_agent(p_agent_name,p_agent_token);
  if v_agent is null then raise exception 'Invalid print agent credentials'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'printerName',printer_name,'jobIds',job_ids) order by created_at,id)
    from print_queue_cancellations where agent_id=v_agent and completed_at is null),'[]'::jsonb);
end $$;

create function public.ack_print_cancellation(p_agent_name text,p_agent_token text,p_request_id uuid,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_agent uuid;
begin
  v_agent := validate_print_agent(p_agent_name,p_agent_token);
  if v_agent is null then raise exception 'Invalid print agent credentials'; end if;
  update print_queue_cancellations set completed_at=case when p_error is null then now() else null end,
    last_error=left(p_error,1000)
  where id=p_request_id and agent_id=v_agent and completed_at is null;
end $$;

create function public.can_submit_print_job(p_agent_name text,p_agent_token text,p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_agent uuid;
begin
  v_agent := validate_print_agent(p_agent_name,p_agent_token);
  if v_agent is null then raise exception 'Invalid print agent credentials'; end if;
  return exists(select 1 from print_jobs where id=p_job_id and status='processing' and locked_by=v_agent)
    and not exists(select 1 from print_queue_cancellations where agent_id=v_agent and completed_at is null);
end $$;
-- Preserve the current claim implementation, including any production fixes.
alter function public.claim_print_jobs(text,text,integer) rename to claim_print_jobs_before_spool_cancel;
revoke all on function public.claim_print_jobs_before_spool_cancel(text,text,integer) from public,anon,authenticated;
create function public.claim_print_jobs(p_agent_name text,p_agent_token text,p_limit integer default 3)
returns table(job_id uuid,job_type text,attempt_number integer,order_payload jsonb)
language plpgsql security definer set search_path=public as $$
declare v_agent uuid;
begin
  v_agent := validate_print_agent(p_agent_name,p_agent_token);
  if v_agent is null then raise exception 'Invalid print agent credentials'; end if;
  if exists(select 1 from print_queue_cancellations where agent_id=v_agent and completed_at is null) then return; end if;
  return query select * from public.claim_print_jobs_before_spool_cancel(p_agent_name,p_agent_token,p_limit);
end $$;
revoke all on function public.claim_print_jobs(text,text,integer) from public;
grant execute on function public.claim_print_jobs(text,text,integer) to anon,authenticated;

revoke all on function public.poll_print_cancellations(text,text) from public;
revoke all on function public.ack_print_cancellation(text,text,uuid,text) from public;
revoke all on function public.can_submit_print_job(text,text,uuid) from public;
grant execute on function public.poll_print_cancellations(text,text) to anon,authenticated;
grant execute on function public.ack_print_cancellation(text,text,uuid,text) to anon,authenticated;
grant execute on function public.can_submit_print_job(text,text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;

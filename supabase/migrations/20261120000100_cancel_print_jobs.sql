-- Let administrators and cashiers remove queued print jobs from the printing page.
-- Cancelled jobs are kept as history (status 'failed' + reason) instead of being deleted,
-- the same way jobs retired by the cash-printer switch are recorded.
-- A job the agent is already printing is released too: its later complete/fail calls no
-- longer match (status is not 'processing'), so it is never retried.
-- Idempotent: safe to run more than once.
begin;

create or replace function public.cancel_print_jobs(p_job_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles
    where id = auth.uid() and is_active and role::text in ('administrador','cajero')
  ) then
    raise exception 'Sin permiso para cancelar impresiones';
  end if;

  update public.print_jobs
  set status = 'failed',
      last_error = 'Cancelado manualmente',
      locked_at = null,
      locked_by = null
  where status in ('pending','processing')
    and (p_job_ids is null or id = any(p_job_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cancel_print_jobs(uuid[]) from public, anon;
grant execute on function public.cancel_print_jobs(uuid[]) to authenticated;

notify pgrst,'reload schema';
commit;

alter table public.kitchen_tickets
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by_cash_session_id uuid
    references public.cash_sessions(id) on delete set null,
  add column if not exists dismissal_reason text;

create index if not exists kitchen_tickets_active_kds_idx
  on public.kitchen_tickets (status, created_at)
  where dismissed_at is null;

create or replace function public.dismiss_active_kds_on_cash_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'cerrada' or old.status = 'cerrada' then
    return new;
  end if;

  update public.kitchen_tickets
  set
    dismissed_at = coalesce(new.closed_at, timezone('utc', now())),
    dismissed_by_cash_session_id = new.id,
    dismissal_reason = 'Cierre de turno con pedidos sin terminar'
  where status in ('pendiente', 'en_preparacion')
    and dismissed_at is null;

  return new;
end;
$$;

revoke all on function public.dismiss_active_kds_on_cash_close() from public;
revoke all on function public.dismiss_active_kds_on_cash_close() from anon;
revoke all on function public.dismiss_active_kds_on_cash_close() from authenticated;

drop trigger if exists cash_session_dismiss_active_kds on public.cash_sessions;
create trigger cash_session_dismiss_active_kds
after update of status on public.cash_sessions
for each row
execute function public.dismiss_active_kds_on_cash_close();

notify pgrst, 'reload schema';

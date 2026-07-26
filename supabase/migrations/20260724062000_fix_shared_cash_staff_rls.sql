create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('administrador', 'cajero')
        and is_active = true
    ),
    false
  )
$$;

drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles read operational staff" on public.profiles;
create policy "profiles read operational staff"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    public.is_active_staff()
    and role in ('administrador', 'cajero', 'cocina')
  )
);

drop policy if exists "cash sessions staff manage" on public.cash_sessions;
drop policy if exists "cash sessions staff read" on public.cash_sessions;
drop policy if exists "cash sessions staff open" on public.cash_sessions;
drop policy if exists "cash sessions staff update open" on public.cash_sessions;
drop policy if exists "cash sessions admin delete" on public.cash_sessions;

create policy "cash sessions staff read"
on public.cash_sessions
for select
to authenticated
using (public.is_active_staff());

create policy "cash sessions staff open"
on public.cash_sessions
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.current_app_role() = 'cajero'
    and cashier_id = auth.uid()
  )
);

create policy "cash sessions staff update open"
on public.cash_sessions
for update
to authenticated
using (
  public.is_admin()
  or (
    public.current_app_role() = 'cajero'
    and status = 'abierta'
  )
)
with check (public.is_active_staff());

create policy "cash sessions admin delete"
on public.cash_sessions
for delete
to authenticated
using (public.is_admin());

create or replace function public.protect_cash_session_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and new.cashier_id is distinct from old.cashier_id then
    raise exception 'No se puede cambiar el responsable que abrió la caja.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_cash_session_identity on public.cash_sessions;
create trigger protect_cash_session_identity
before update on public.cash_sessions
for each row execute procedure public.protect_cash_session_identity();

drop policy if exists "cash movements staff manage" on public.cash_movements;
drop policy if exists "cash movements staff read" on public.cash_movements;
drop policy if exists "cash movements staff insert" on public.cash_movements;
drop policy if exists "cash movements staff reverse" on public.cash_movements;
drop policy if exists "cash movements admin delete" on public.cash_movements;

create policy "cash movements staff read"
on public.cash_movements
for select
to authenticated
using (public.is_active_staff());

create policy "cash movements staff insert"
on public.cash_movements
for insert
to authenticated
with check (
  public.is_active_staff()
  and (performed_by = auth.uid() or public.is_admin())
);

create policy "cash movements staff reverse"
on public.cash_movements
for update
to authenticated
using (
  public.is_active_staff()
  and exists (
    select 1
    from public.cash_sessions session
    where session.id = cash_movements.session_id
      and session.status = 'abierta'
  )
)
with check (
  public.is_active_staff()
  and (performed_by = auth.uid() or public.is_admin())
);

create policy "cash movements admin delete"
on public.cash_movements
for delete
to authenticated
using (public.is_admin());

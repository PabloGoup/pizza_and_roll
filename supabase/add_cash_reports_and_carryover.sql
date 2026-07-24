-- Cortes X/Z y reportes de cuadratura inmutables.
-- Ejecutar después de schema.sql.

alter table public.cash_sessions
  add column if not exists next_opening_amount numeric(12, 2),
  add column if not exists difference_reason text,
  add column if not exists closing_report_id uuid;

alter table public.orders
  add column if not exists card_type text
  check (card_type is null or card_type in ('debito', 'credito'));

create table if not exists public.cash_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete restrict,
  report_type text not null check (report_type in ('X', 'Z', 'CUADRATURA')),
  report_number text not null unique,
  generated_by uuid not null references public.profiles(id),
  snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_cash_reports_session_created
  on public.cash_reports(session_id, created_at desc);

create index if not exists idx_cash_reports_type_created
  on public.cash_reports(report_type, created_at desc);

alter table public.cash_reports enable row level security;

-- Compatibilidad con copias anteriores de esta migración que referenciaban
-- current_user_role(). Puede conservarse para otras políticas del proyecto.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.profiles
  where id = auth.uid()
    and is_active = true
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- Función autocontenida: no depende de current_user_role() ni de otras
-- migraciones. SECURITY DEFINER evita que las políticas RLS de profiles
-- impidan validar el perfil del usuario autenticado.
create or replace function public.can_manage_cash_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role::text in ('administrador', 'cajero')
  );
$$;

revoke all on function public.can_manage_cash_reports() from public;
grant execute on function public.can_manage_cash_reports() to authenticated;

drop policy if exists "cash reports staff read" on public.cash_reports;
create policy "cash reports staff read" on public.cash_reports
  for select to authenticated
  using (public.can_manage_cash_reports());

drop policy if exists "cash reports staff insert" on public.cash_reports;
create policy "cash reports staff insert" on public.cash_reports
  for insert to authenticated
  with check (
    public.can_manage_cash_reports()
    and generated_by = auth.uid()
  );

alter table public.cash_sessions
  drop constraint if exists cash_sessions_closing_report_id_fkey;

alter table public.cash_sessions
  add constraint cash_sessions_closing_report_id_fkey
  foreign key (closing_report_id) references public.cash_reports(id) on delete set null;

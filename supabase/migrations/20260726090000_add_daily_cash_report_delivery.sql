create table if not exists public.daily_cash_report_settings (
  id boolean primary key default true check (id),
  is_enabled boolean not null default true,
  recipients text[] not null default '{}',
  sender_name text not null default 'Pizza and Roll',
  subject_prefix text not null default 'Cierre diario',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.daily_cash_report_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.daily_cash_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.cash_sessions(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  recipients text[] not null default '{}',
  attempts integer not null default 0,
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists daily_cash_report_deliveries_status_idx
  on public.daily_cash_report_deliveries (status, created_at);

alter table public.daily_cash_report_settings enable row level security;
alter table public.daily_cash_report_deliveries enable row level security;

drop policy if exists "daily report settings admin read" on public.daily_cash_report_settings;
create policy "daily report settings admin read"
on public.daily_cash_report_settings for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role = 'administrador'
  )
);

drop policy if exists "daily report settings admin update" on public.daily_cash_report_settings;
create policy "daily report settings admin update"
on public.daily_cash_report_settings for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role = 'administrador'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role = 'administrador'
  )
);

drop policy if exists "daily report deliveries admin read" on public.daily_cash_report_deliveries;
create policy "daily report deliveries admin read"
on public.daily_cash_report_deliveries for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role = 'administrador'
  )
);

create or replace function public.enqueue_daily_cash_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report_settings public.daily_cash_report_settings%rowtype;
begin
  if new.status <> 'cerrada' or old.status = 'cerrada' then
    return new;
  end if;

  select *
  into report_settings
  from public.daily_cash_report_settings
  where id = true;

  insert into public.daily_cash_report_deliveries (
    session_id,
    status,
    recipients
  )
  values (
    new.id,
    case
      when coalesce(report_settings.is_enabled, false)
        and cardinality(coalesce(report_settings.recipients, '{}')) > 0
      then 'pending'
      else 'skipped'
    end,
    coalesce(report_settings.recipients, '{}')
  )
  on conflict (session_id) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_daily_cash_report() from public;
revoke all on function public.enqueue_daily_cash_report() from anon;
revoke all on function public.enqueue_daily_cash_report() from authenticated;

drop trigger if exists cash_session_enqueue_daily_report on public.cash_sessions;
create trigger cash_session_enqueue_daily_report
after update of status on public.cash_sessions
for each row
execute function public.enqueue_daily_cash_report();

notify pgrst, 'reload schema';

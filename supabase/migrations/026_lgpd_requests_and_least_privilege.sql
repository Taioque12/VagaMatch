-- Solicitações de direitos do titular. A exclusão é revisada antes de apagar
-- dados que possam exigir retenção fiscal, antifraude ou de pagamentos.
create table if not exists public.lgpd_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('account_deletion')),
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'completed', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists lgpd_requests_one_open_per_user
  on public.lgpd_requests(user_id, request_type)
  where status in ('pending', 'in_review');

alter table public.lgpd_requests enable row level security;

create policy "usuario ve as proprias solicitacoes lgpd"
  on public.lgpd_requests for select to authenticated
  using (auth.uid() = user_id);

create policy "usuario cria solicitacao lgpd"
  on public.lgpd_requests for insert to authenticated
  with check (
    auth.uid() = user_id
    and request_type = 'account_deletion'
    and status = 'pending'
    and completed_at is null
  );

create policy "usuario cancela solicitacao lgpd pendente"
  on public.lgpd_requests for update to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

create policy "admin ve solicitacoes lgpd"
  on public.lgpd_requests for select to authenticated
  using (public.is_admin());

create or replace function public.protect_lgpd_request_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.user_id is distinct from old.user_id
      or new.request_type is distinct from old.request_type
      or new.requested_at is distinct from old.requested_at
      or new.completed_at is distinct from old.completed_at
      or old.status <> 'pending'
      or new.status <> 'cancelled'
    then
      raise exception 'transicao de solicitacao nao permitida';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_lgpd_request_transition on public.lgpd_requests;
create trigger protect_lgpd_request_transition
  before update on public.lgpd_requests
  for each row execute function public.protect_lgpd_request_transition();

revoke all on function public.protect_lgpd_request_transition() from public, anon, authenticated;

-- Menor privilégio: RLS continua sendo a barreira por linha, e os grants
-- passam a refletir somente as operações realmente usadas pelo cliente.
revoke all on all tables in schema public from anon;

revoke all on public.profiles, public.curriculos, public.preferencias,
  public.vagas_vistas, public.entrevistas, public.indicacoes,
  public.api_rate_limits, public.app_state, public.distributed_locks,
  public.mp_checkout_sessions, public.payment_webhook_events,
  public.telegram_link_tokens, public.lgpd_requests from authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.curriculos to authenticated;
grant select, insert, update, delete on public.preferencias to authenticated;
grant select, update on public.vagas_vistas to authenticated;
grant select on public.entrevistas to authenticated;
grant select on public.indicacoes to authenticated;
grant select, insert, update on public.lgpd_requests to authenticated;
grant all on public.lgpd_requests to service_role;

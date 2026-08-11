create table if not exists public.mp_checkout_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plano text not null check (plano in ('match', 'match_plus')),
  recorrencia text not null check (recorrencia in ('mensal', 'anual')),
  status text not null check (status in ('creating', 'ready', 'failed', 'completed')),
  mp_preapproval_id text,
  init_point text,
  request_owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mp_checkout_sessions enable row level security;
grant all on public.mp_checkout_sessions to service_role;

create or replace function public.reserve_mp_checkout(
  p_user_id uuid,
  p_plano text,
  p_recorrencia text,
  p_owner_id uuid
)
returns public.mp_checkout_sessions
language plpgsql
security definer set search_path = public
as $$
declare v_session public.mp_checkout_sessions;
begin
  insert into public.mp_checkout_sessions(user_id, plano, recorrencia, status, request_owner_id)
  values (p_user_id, p_plano, p_recorrencia, 'creating', p_owner_id)
  on conflict (user_id) do update
    set plano = excluded.plano, recorrencia = excluded.recorrencia, status = 'creating',
        mp_preapproval_id = null, init_point = null, request_owner_id = p_owner_id, updated_at = now()
    where public.mp_checkout_sessions.status = 'failed'
       or public.mp_checkout_sessions.status = 'completed'
       or (public.mp_checkout_sessions.status = 'creating'
           and public.mp_checkout_sessions.updated_at < now() - interval '10 minutes')
  returning * into v_session;

  if v_session.user_id is null then
    select * into v_session from public.mp_checkout_sessions where user_id = p_user_id;
  end if;
  return v_session;
end;
$$;

create table if not exists public.payment_webhook_events (
  provider text not null,
  event_id text not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  owner_id uuid,
  processing_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(provider, event_id)
);

alter table public.payment_webhook_events enable row level security;
grant all on public.payment_webhook_events to service_role;

create or replace function public.claim_payment_webhook_event(
  p_provider text,
  p_event_id text,
  p_owner_id uuid,
  p_lease_seconds integer
) returns text
language plpgsql
security definer set search_path = public
as $$
declare v_status text;
begin
  insert into public.payment_webhook_events(
    provider, event_id, status, owner_id, processing_until
  ) values (
    p_provider, p_event_id, 'processing', p_owner_id,
    now() + make_interval(secs => p_lease_seconds)
  )
  on conflict (provider, event_id) do update
    set status = 'processing', owner_id = excluded.owner_id,
        processing_until = excluded.processing_until, updated_at = now()
    where public.payment_webhook_events.status = 'failed'
       or (public.payment_webhook_events.status = 'processing'
           and public.payment_webhook_events.processing_until <= now())
  returning status into v_status;

  if v_status = 'processing' then return 'claimed'; end if;

  select status into v_status
    from public.payment_webhook_events
   where provider = p_provider and event_id = p_event_id;
  return case when v_status = 'processed' then 'processed' else 'in_progress' end;
end;
$$;

create or replace function public.finish_payment_webhook_event(
  p_provider text,
  p_event_id text,
  p_owner_id uuid,
  p_success boolean
) returns boolean
language sql
security definer set search_path = public
as $$
  with updated as (
    update public.payment_webhook_events
       set status = case when p_success then 'processed' else 'failed' end,
           owner_id = null, processing_until = null, updated_at = now()
     where provider = p_provider and event_id = p_event_id and owner_id = p_owner_id
     returning 1
  ) select exists(select 1 from updated);
$$;

revoke all on function public.reserve_mp_checkout(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_mp_checkout(uuid, text, text, uuid) to service_role;
revoke all on function public.claim_payment_webhook_event(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_payment_webhook_event(text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_payment_webhook_event(text, text, uuid, integer) to service_role;
grant execute on function public.finish_payment_webhook_event(text, text, uuid, boolean) to service_role;

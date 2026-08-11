-- Segurança e escalabilidade: tokens Telegram, limite distribuído e lock com lease.

create table if not exists public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists telegram_link_tokens_active_user_idx
  on public.telegram_link_tokens(user_id, expires_at)
  where used_at is null;

alter table public.telegram_link_tokens enable row level security;
grant all on public.telegram_link_tokens to service_role;

-- Consome o token e registra o chat em uma única transação. O advisory lock
-- evita que o mesmo chat seja ligado simultaneamente a duas contas.
create or replace function public.consume_telegram_link_token(
  p_token_hash text,
  p_chat_id text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing_user uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_chat_id, 0));

  update public.telegram_link_tokens
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
  returning user_id into v_user_id;

  if v_user_id is null then
    return null;
  end if;

  select id into v_existing_user
    from public.profiles
   where telegram_chat_id = p_chat_id
   for update;

  if v_existing_user is not null and v_existing_user <> v_user_id then
    -- Mantém o token disponível para o dono tentar novamente com outro chat.
    update public.telegram_link_tokens set used_at = null where token_hash = p_token_hash;
    return null;
  end if;

  update public.profiles
     set telegram_chat_id = p_chat_id, updated_at = now()
   where id = v_user_id;

  return v_user_id;
end;
$$;

revoke all on function public.consume_telegram_link_token(text, text) from public, anon, authenticated;
grant execute on function public.consume_telegram_link_token(text, text) to service_role;

-- O cliente pode editar o conteúdo do próprio currículo, mas nunca seu vetor.
create or replace function public.protect_curriculo_system_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and new.embedding is distinct from old.embedding then
    raise exception 'não é permitido alterar o embedding diretamente';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_curriculo_system_columns on public.curriculos;
create trigger protect_curriculo_system_columns
  before update on public.curriculos
  for each row execute function public.protect_curriculo_system_columns();

create table if not exists public.api_rate_limits (
  scope text not null,
  subject_id uuid not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  primary key (scope, subject_id)
);

alter table public.api_rate_limits enable row level security;
grant all on public.api_rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_subject_id uuid,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.api_rate_limits(scope, subject_id, window_started_at, request_count)
  values (p_scope, p_subject_id, now(), 1)
  on conflict (scope, subject_id) do update
    set window_started_at = case
          when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then now() else public.api_rate_limits.window_started_at end,
        request_count = case
          when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then 1 else public.api_rate_limits.request_count + 1 end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, uuid, integer, integer) to service_role;

create table if not exists public.distributed_locks (
  lock_name text primary key,
  owner_id uuid not null,
  locked_until timestamptz not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

alter table public.distributed_locks enable row level security;
grant all on public.distributed_locks to service_role;

create or replace function public.acquire_distributed_lock(
  p_lock_name text,
  p_owner_id uuid,
  p_lease_seconds integer
) returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.distributed_locks(lock_name, owner_id, locked_until)
  values (p_lock_name, p_owner_id, now() + make_interval(secs => p_lease_seconds))
  on conflict (lock_name) do update
    set owner_id = excluded.owner_id,
        locked_until = excluded.locked_until,
        acquired_at = now(),
        heartbeat_at = now()
    where public.distributed_locks.locked_until <= now()
       or public.distributed_locks.owner_id = excluded.owner_id;

  return found;
end;
$$;

create or replace function public.renew_distributed_lock(
  p_lock_name text,
  p_owner_id uuid,
  p_lease_seconds integer
) returns boolean
language sql
security definer set search_path = public
as $$
  with updated as (
    update public.distributed_locks
       set locked_until = now() + make_interval(secs => p_lease_seconds), heartbeat_at = now()
     where lock_name = p_lock_name and owner_id = p_owner_id and locked_until > now()
     returning 1
  ) select exists(select 1 from updated);
$$;

create or replace function public.release_distributed_lock(p_lock_name text, p_owner_id uuid)
returns boolean
language sql
security definer set search_path = public
as $$
  with deleted as (
    delete from public.distributed_locks where lock_name = p_lock_name and owner_id = p_owner_id returning 1
  ) select exists(select 1 from deleted);
$$;

revoke all on function public.acquire_distributed_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.renew_distributed_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_distributed_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_distributed_lock(text, uuid, integer) to service_role;
grant execute on function public.renew_distributed_lock(text, uuid, integer) to service_role;
grant execute on function public.release_distributed_lock(text, uuid) to service_role;

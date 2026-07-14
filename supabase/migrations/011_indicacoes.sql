-- Sistema de indicação: código único por usuário, recompensa só é creditada
-- quando o indicado paga a primeira mensalidade (evita fraude de conta fake).

alter table public.profiles add column if not exists codigo_indicacao text unique;
alter table public.profiles add column if not exists indicado_por uuid references public.profiles (id);
alter table public.profiles add column if not exists creditos_indicacao integer not null default 0;

-- Gera código curto e único (8 chars base36) para perfis novos.
create or replace function public.gerar_codigo_indicacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_codigo text;
begin
  if new.codigo_indicacao is not null then
    return new;
  end if;
  loop
    novo_codigo := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from public.profiles where codigo_indicacao = novo_codigo);
  end loop;
  new.codigo_indicacao := novo_codigo;
  return new;
end;
$$;

drop trigger if exists trg_gerar_codigo_indicacao on public.profiles;
create trigger trg_gerar_codigo_indicacao
  before insert on public.profiles
  for each row execute function public.gerar_codigo_indicacao();

-- Backfill dos perfis já existentes sem código.
update public.profiles set codigo_indicacao = substr(md5(random()::text || id::text), 1, 8)
where codigo_indicacao is null;

-- Histórico de indicações: 1 linha por indicado, status muda quando ele paga.
create table if not exists public.indicacoes (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references public.profiles (id) on delete cascade,
  indicado_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  created_at timestamptz not null default now(),
  pago_em timestamptz
);

alter table public.indicacoes enable row level security;

create policy "usuario ve indicacoes que fez"
  on public.indicacoes for select
  using (auth.uid() = indicador_id);

grant all on public.indicacoes to service_role;

-- RPC chamada pelo front logo após signup, se veio com ?ref=codigo.
-- security definer pois o usuário não tem select em profiles alheios.
create or replace function public.registrar_indicacao(p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indicador_id uuid;
begin
  if p_codigo is null or p_codigo = '' then
    return;
  end if;

  select id into v_indicador_id from public.profiles where codigo_indicacao = p_codigo;

  if v_indicador_id is null or v_indicador_id = auth.uid() then
    return;
  end if;

  update public.profiles
    set indicado_por = v_indicador_id
    where id = auth.uid() and indicado_por is null;

  insert into public.indicacoes (indicador_id, indicado_id)
    values (v_indicador_id, auth.uid())
    on conflict (indicado_id) do nothing;
end;
$$;

grant execute on function public.registrar_indicacao(text) to authenticated;

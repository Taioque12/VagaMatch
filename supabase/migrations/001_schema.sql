-- Schema multi-tenant do VagaMatch
-- Todas as tabelas isoladas por usuário via RLS (auth.uid() = user_id).
-- O worker do pipeline usa a service_role key, que ignora RLS por padrão.

-- Perfil do usuário (dados que não vêm do auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text,
  localizacao text,
  telegram_chat_id text,
  plano text not null default 'gratis' check (plano in ('gratis', 'pago')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "usuario ve o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "usuario edita o proprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "usuario cria o proprio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Currículo-base estruturado (fonte fixa de verdade por usuário — nunca inventar além disto)
create table if not exists public.curriculos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  resumo_profissional text not null default '',
  habilidades jsonb not null default '[]'::jsonb,
  experiencias jsonb not null default '[]'::jsonb, -- [{cargo, empresa, periodo, bullets: []}]
  formacao jsonb not null default '[]'::jsonb,
  cursos jsonb not null default '[]'::jsonb,
  projetos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.curriculos enable row level security;

create policy "usuario ve o proprio curriculo"
  on public.curriculos for select
  using (auth.uid() = user_id);

create policy "usuario edita o proprio curriculo"
  on public.curriculos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Preferências de busca por usuário
create table if not exists public.preferencias (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cargos_alvo jsonb not null default '[]'::jsonb,
  palavras_chave jsonb not null default '[]'::jsonb,
  regioes jsonb not null default '[]'::jsonb,
  ativo boolean not null default true, -- pausa a busca sem apagar config
  updated_at timestamptz not null default now()
);

alter table public.preferencias enable row level security;

create policy "usuario ve as proprias preferencias"
  on public.preferencias for select
  using (auth.uid() = user_id);

create policy "usuario edita as proprias preferencias"
  on public.preferencias for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Vagas encontradas/notificadas por usuário
create table if not exists public.vagas_vistas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null,
  titulo text not null,
  empresa text,
  fonte text not null default 'Adzuna',
  url text,
  score int not null default 0,
  data_encontrada timestamptz not null default now(),
  status text not null default 'descoberta'
    check (status in ('descoberta', 'notificada', 'candidatado', 'descartada', 'erro')),
  feedback text check (feedback in ('positivo', 'negativo')),
  telegram_message_id text,
  callback_id uuid not null default gen_random_uuid(),
  curriculo_gerado_path text,
  unique (user_id, job_id)
);

create index if not exists vagas_vistas_user_status_idx on public.vagas_vistas (user_id, status);
create index if not exists vagas_vistas_data_idx on public.vagas_vistas (data_encontrada desc);
create unique index if not exists vagas_vistas_callback_id_idx on public.vagas_vistas (callback_id);

alter table public.vagas_vistas enable row level security;

create policy "usuario ve as proprias vagas"
  on public.vagas_vistas for select
  using (auth.uid() = user_id);

-- Sem policy de insert/update/delete para authenticated: só o worker (service_role,
-- que ignora RLS) grava vagas. O usuário só visualiza e reage (feedback via app).
create policy "usuario registra feedback na propria vaga"
  on public.vagas_vistas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Permissões explícitas para o service_role (worker do pipeline)
grant all on public.profiles to service_role;
grant all on public.curriculos to service_role;
grant all on public.preferencias to service_role;
grant all on public.vagas_vistas to service_role;
grant usage on schema public to service_role;

-- Cria profile automaticamente quando um usuário se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.curriculos (user_id) values (new.id);
  insert into public.preferencias (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

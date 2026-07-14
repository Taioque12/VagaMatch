-- Entrevista simulada por texto no Telegram (MVP).
-- Estado da conversa vive aqui; o webhook roteia mensagens de quem tem sessão ativa.
create table if not exists public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  vaga_id uuid not null references public.vagas_vistas (id) on delete cascade,
  status text not null default 'oferecida' check (status in ('oferecida', 'ativa', 'encerrada')),
  historico jsonb not null default '[]'::jsonb, -- [{papel: 'recrutador'|'candidato', texto}]
  perguntas_feitas int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma sessão ativa (ou oferta pendente) por usuário — roteamento sem ambiguidade.
create unique index if not exists entrevistas_uma_em_andamento_idx
  on public.entrevistas (user_id) where status in ('oferecida', 'ativa');

create index if not exists entrevistas_user_created_idx
  on public.entrevistas (user_id, created_at desc);

alter table public.entrevistas enable row level security;

-- Usuário só lê as próprias (histórico pode aparecer no painel futuramente).
-- Escrita é exclusiva do webhook via service_role.
create policy "usuario ve as proprias entrevistas"
  on public.entrevistas for select
  using (auth.uid() = user_id);

grant all on public.entrevistas to service_role;

-- Observabilidade do worker: erros críticos e métricas por rodada persistidos
-- no banco (independente do Telegram, que é best-effort e pode falhar
-- silenciosamente). Retry de vagas órfãs já existe desde a migration 015
-- (coluna vagas_vistas.tentativas + status 'erro' terminal) — não duplicado aqui.

-- ─── worker_errors ──────────────────────────────────────────────────────────
create table if not exists public.worker_errors (
  id uuid primary key default gen_random_uuid(),
  error_message text not null,
  stack_trace text,
  context jsonb,
  created_at timestamptz not null default now()
);

alter table public.worker_errors enable row level security;
-- Sem policies: só a service_role (usada pelo worker) acessa esta tabela.

-- ─── worker_metrics ─────────────────────────────────────────────────────────
create table if not exists public.worker_metrics (
  id uuid primary key default gen_random_uuid(),
  executado_em timestamptz not null default now(),
  usuarios_processados int not null default 0,
  vagas_notificadas int not null default 0,
  falhas_gerais int not null default 0
);

alter table public.worker_metrics enable row level security;
-- Sem policies: só a service_role (usada pelo worker) acessa esta tabela.

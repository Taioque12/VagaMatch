-- 017: Fase 5 / V3 — Fase A (Vetorização)
-- pgvector + colunas de embedding + índices HNSW + RPC de similaridade.
-- Embeddings: Gemini text-embedding-004 (768 dims).

create extension if not exists vector;

-- Embedding do currículo-base consolidado (regravado a cada re-upload)
alter table public.curriculos
  add column if not exists embedding vector(768);

-- Embedding da vaga (titulo + descricao), gerado em batch pelo worker
alter table public.vagas_vistas
  add column if not exists embedding vector(768);

-- HNSW: busca aproximada por cosseno. Colunas majoritariamente nulas no início
-- não atrapalham — índice só cobre linhas com embedding preenchido.
create index if not exists curriculos_embedding_hnsw
  on public.curriculos using hnsw (embedding vector_cosine_ops);

create index if not exists vagas_vistas_embedding_hnsw
  on public.vagas_vistas using hnsw (embedding vector_cosine_ops);

-- Similaridade currículo×vaga do próprio usuário.
-- Retorna NULL se qualquer um dos embeddings ainda não existir — o worker
-- interpreta NULL como "sem sinal vetorial, segue fluxo normal" (fail-open).
create or replace function public.match_vaga_curriculo(
  p_user_id uuid,
  p_vaga_id uuid
) returns float
language sql
stable
security definer
set search_path = public
as $$
  select 1 - (c.embedding <=> v.embedding)
  from public.curriculos c
  join public.vagas_vistas v on v.id = p_vaga_id and v.user_id = p_user_id
  where c.user_id = p_user_id
    and c.embedding is not null
    and v.embedding is not null;
$$;

-- Só o worker (service_role) chama a RPC; nega pro resto.
revoke all on function public.match_vaga_curriculo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.match_vaga_curriculo(uuid, uuid) to service_role;

-- Config V3 calibrável a quente (worker lê de app_state com estes defaults):
insert into public.app_state (key, value) values
  ('v3_prefiltro', 'off'),
  ('v3_threshold_similaridade', '0.55'),
  ('v3_pesos_score', '{"vetor":0.5,"tecnico":0.3,"fit":0.2}')
on conflict (key) do nothing;

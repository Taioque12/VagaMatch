-- pgvector 0.8.2 informa extrelocatable=true. ALTER EXTENSION preserva OIDs,
-- colunas vector(768), operadores e índices HNSW existentes.
create schema if not exists extensions;
alter extension vector set schema extensions;

-- Operadores pgvector são resolvidos pelo search_path em tempo de execução.
-- As funções abaixo comparam embeddings ou usam <=> e deixam de funcionar se
-- continuarem limitadas a public após a realocação da extensão.
alter function public.protect_curriculo_system_columns()
  set search_path = public, extensions;
alter function public.protect_vaga_privileged_columns()
  set search_path = public, extensions;
alter function public.match_vaga_curriculo(uuid, uuid)
  set search_path = public, extensions;
alter function public.ajuste_feedback_vetorial(uuid, uuid)
  set search_path = public, extensions;

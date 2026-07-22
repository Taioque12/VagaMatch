-- Filtro de modalidade de trabalho (home office / híbrido / presencial).
-- 'qualquer' = comportamento atual (sem filtro) — não quebra usuários existentes.
alter table public.preferencias
  add column if not exists modalidade_trabalho text not null default 'qualquer'
    check (modalidade_trabalho in ('qualquer', 'remoto', 'hibrido', 'presencial'));

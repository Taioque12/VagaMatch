-- Max retries do worker: vagas com erro persistente (não-429) param de ser
-- reprocessadas após N tentativas — contador incrementado pelo worker,
-- que marca status 'erro' ao atingir o limite.
alter table public.vagas_vistas
  add column if not exists tentativas integer not null default 0;

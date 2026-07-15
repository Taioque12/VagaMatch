-- 018: Fase 5 / V3 — Fase C (Aprendizado com feedback)
-- Reusa vagas_vistas como banco de memórias: embedding (migration 017) +
-- status ('candidatado'/'descartada') já são o par sinal+vetor. Só falta o
-- carimbo de QUANDO o feedback aconteceu, pra janela de "recente".

alter table public.vagas_vistas
  add column if not exists feedback_em timestamptz;

-- Índice parcial: só linhas com feedback interessam à RPC.
create index if not exists vagas_vistas_feedback_idx
  on public.vagas_vistas (user_id, status, feedback_em)
  where feedback_em is not null;

-- Similaridade média da vaga-alvo com as 5 vagas mais parecidas que o usuário
-- descartou / candidatou nos últimos 90 dias. NULL em qualquer lado = sem sinal
-- (fail-open, mesmo contrato da match_vaga_curriculo).
create or replace function public.ajuste_feedback_vetorial(
  p_user_id uuid,
  p_vaga_id uuid
) returns table (sim_descartes float, sim_candidaturas float)
language sql
stable
security definer
set search_path = public
as $$
  with alvo as (
    select embedding
    from public.vagas_vistas
    where id = p_vaga_id and user_id = p_user_id and embedding is not null
  )
  select
    (select avg(s) from (
      select 1 - (v.embedding <=> a.embedding) as s
      from public.vagas_vistas v, alvo a
      where v.user_id = p_user_id
        and v.status = 'descartada'
        and v.embedding is not null
        and v.feedback_em > now() - interval '90 days'
      order by v.embedding <=> a.embedding
      limit 5
    ) d) as sim_descartes,
    (select avg(s) from (
      select 1 - (v.embedding <=> a.embedding) as s
      from public.vagas_vistas v, alvo a
      where v.user_id = p_user_id
        and v.status = 'candidatado'
        and v.embedding is not null
        and v.feedback_em > now() - interval '90 days'
      order by v.embedding <=> a.embedding
      limit 5
    ) c) as sim_candidaturas
  from alvo;
$$;

revoke all on function public.ajuste_feedback_vetorial(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ajuste_feedback_vetorial(uuid, uuid) to service_role;

-- Fator do ajuste (delta = fator * (sim_candidaturas - sim_descartes)),
-- calibrável a quente como o resto da config V3.
insert into public.app_state (key, value) values
  ('v3_fator_feedback', '0.15')
on conflict (key) do nothing;

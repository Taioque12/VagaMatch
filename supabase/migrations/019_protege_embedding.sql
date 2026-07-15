-- 019: blinda vagas_vistas.embedding no trigger de proteção (012).
-- embedding é escrito só pelo worker (service_role); usuário sobrescrevendo o
-- próprio vetor distorceria o pré-filtro/memória da V3 (afeta só ele, mas
-- auditoria LGPD/RLS pede colunas de sistema 100% fechadas ao cliente).
create or replace function public.protect_vaga_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if (new.status is distinct from old.status
        and new.status not in ('candidatado', 'descartada'))
      or new.score is distinct from old.score
      or new.telegram_message_id is distinct from old.telegram_message_id
      or new.curriculo_gerado_path is distinct from old.curriculo_gerado_path
      or new.job_id is distinct from old.job_id
      or new.titulo is distinct from old.titulo
      or new.empresa is distinct from old.empresa
      or new.fonte is distinct from old.fonte
      or new.url is distinct from old.url
      or new.data_encontrada is distinct from old.data_encontrada
      or new.callback_id is distinct from old.callback_id
      or new.salario_min is distinct from old.salario_min
      or new.salario_max is distinct from old.salario_max
      or new.embedding is distinct from old.embedding
    then
      raise exception 'usuário só pode alterar feedback e marcar candidatado/descartada';
    end if;
  end if;
  return new;
end;
$$;

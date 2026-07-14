-- Fix 1: colunas de indicação (011) ficaram fora do trigger de proteção —
-- usuário podia inflar creditos_indicacao ou trocar o próprio codigo_indicacao.
-- indicado_por pode ser setado uma única vez (old null → valor), pois a RPC
-- registrar_indicacao roda com o JWT do usuário (auth.role() = 'authenticated').
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.role is distinct from old.role
      or new.plano is distinct from old.plano
      or new.assinatura_status is distinct from old.assinatura_status
      or new.assinatura_recorrencia is distinct from old.assinatura_recorrencia
      or new.assinatura_inicio is distinct from old.assinatura_inicio
      or new.assinatura_proxima_cobranca is distinct from old.assinatura_proxima_cobranca
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.stripe_subscription_id is distinct from old.stripe_subscription_id
      or new.creditos_indicacao is distinct from old.creditos_indicacao
      or new.codigo_indicacao is distinct from old.codigo_indicacao
      or (new.indicado_por is distinct from old.indicado_por and old.indicado_por is not null)
    then
      raise exception 'não é permitido alterar colunas de cobrança, acesso ou indicação diretamente';
    end if;
  end if;
  return new;
end;
$$;

-- Fix 2: o trigger de vagas_vistas bloqueava QUALQUER mudança de status pelo
-- usuário, quebrando os botões "Me candidatei" e "Descartar" do dashboard.
-- Usuário pode mover a vaga para candidatado/descartada (ações legítimas dele);
-- os demais status (pipeline) continuam exclusivos do worker/service_role.
-- Também protege salario_min/max (010) contra edição pelo usuário.
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
    then
      raise exception 'usuário só pode alterar feedback e marcar candidatado/descartada';
    end if;
  end if;
  return new;
end;
$$;

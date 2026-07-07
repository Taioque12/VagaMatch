-- Fix: policies de UPDATE em profiles e vagas_vistas cobriam a linha inteira,
-- permitindo que qualquer usuário autenticado alterasse colunas sensíveis
-- (role, plano, assinatura_*, score, status) via update simples no próprio id.
-- RLS não restringe coluna — usamos trigger BEFORE UPDATE pra travar essas colunas
-- quando a alteração não vem do service_role (worker/admin).

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
    then
      raise exception 'não é permitido alterar role/plano/assinatura diretamente';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- Mesma lógica pra vagas_vistas: usuário só pode alterar "feedback", nada mais.
create or replace function public.protect_vaga_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.status is distinct from old.status
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
    then
      raise exception 'usuário só pode alterar o campo feedback';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_vaga_privileged_columns on public.vagas_vistas;
create trigger protect_vaga_privileged_columns
  before update on public.vagas_vistas
  for each row execute function public.protect_vaga_privileged_columns();

-- Billing Mercado Pago: colunas de vínculo com a assinatura (preapproval)
-- e quota de busca do plano free (1 busca/24h) via preferencias.ultima_busca_em.

alter table public.profiles
  add column if not exists mp_preapproval_id text unique,
  add column if not exists mp_payer_id text;

comment on column public.profiles.mp_preapproval_id is 'ID da assinatura (preapproval) no Mercado Pago';
comment on column public.profiles.mp_payer_id is 'ID do pagador no Mercado Pago';

alter table public.preferencias
  add column if not exists ultima_busca_em timestamptz;

-- CHECK constraints antigos (001/004) não aceitam os valores novos do billing
-- ('match'/'match_plus'/'free' e 'pausada') — sem isso o webhook falha silencioso
-- ao ativar plano pago.
alter table public.profiles
  drop constraint if exists profiles_plano_check;
alter table public.profiles
  add constraint profiles_plano_check
  check (plano in ('gratis', 'free', 'pago', 'match', 'match_plus'));

alter table public.profiles
  drop constraint if exists profiles_assinatura_status_check;
alter table public.profiles
  add constraint profiles_assinatura_status_check
  check (assinatura_status in ('gratis', 'ativa', 'cancelada', 'pendente', 'pausada'));

-- Protege a quota free: sem isso o usuário edita as próprias preferencias e
-- seta ultima_busca_em = null, zerando a quota de 24h quando quiser.
create or replace function public.protect_preferencias_quota_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.ultima_busca_em is distinct from old.ultima_busca_em then
      raise exception 'não é permitido alterar a quota de busca diretamente';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_preferencias_quota on public.preferencias;
create trigger protect_preferencias_quota
  before update on public.preferencias
  for each row execute function public.protect_preferencias_quota_columns();

comment on column public.preferencias.ultima_busca_em is 'Última rodada de busca processada pelo worker (quota do plano free: 1/24h)';

-- Atualiza a proteção pra incluir as colunas mp_* na lista bloqueada
-- (só service_role escreve). Segue o padrão da 007/012.
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
      or new.mp_preapproval_id is distinct from old.mp_preapproval_id
      or new.mp_payer_id is distinct from old.mp_payer_id
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

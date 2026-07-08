-- Adiciona colunas para vincular com a conta e assinatura do Stripe

alter table public.profiles
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique;

comment on column public.profiles.stripe_customer_id is 'ID do cliente no Stripe (ex: cus_1234)';
comment on column public.profiles.stripe_subscription_id is 'ID da assinatura ativa no Stripe (ex: sub_1234)';

-- Nota: a trigger existente 'protect_profile_privileged_columns' 
-- já bloqueia alterações não-admin nas colunas 'assinatura_*' e 'role'.
-- Vamos também garantir que o usuário não consiga alterar as colunas do Stripe.

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
    then
      raise exception 'não é permitido alterar colunas de cobrança ou acesso diretamente';
    end if;
  end if;
  return new;
end;
$$;

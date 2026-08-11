-- Mantém somente o servidor capaz de definir embeddings em novos currículos.
create or replace function public.protect_curriculo_system_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and ((tg_op = 'INSERT' and new.embedding is not null)
       or (tg_op = 'UPDATE' and new.embedding is distinct from old.embedding)) then
    raise exception 'não é permitido alterar o embedding diretamente';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_curriculo_system_columns on public.curriculos;
create trigger protect_curriculo_system_columns
  before insert or update on public.curriculos
  for each row execute function public.protect_curriculo_system_columns();

-- Serializa a emissão por usuário: após duas solicitações concorrentes, só o
-- último token permanece utilizável.
create or replace function public.issue_telegram_link_token(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_expires_at <= now() then
    raise exception 'expiração do token deve estar no futuro';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.telegram_link_tokens
     set used_at = now()
   where user_id = p_user_id and used_at is null;
  insert into public.telegram_link_tokens(user_id, token_hash, expires_at)
  values (p_user_id, p_token_hash, p_expires_at);
end;
$$;

revoke all on function public.issue_telegram_link_token(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.issue_telegram_link_token(uuid, text, timestamptz) to service_role;

-- Uma indicação só pode virar crédito uma vez, mesmo com eventos Stripe
-- duplicados concorrentes. O update da indicação e do saldo compartilham a
-- mesma transação do RPC.
create or replace function public.credit_referral_after_paid_subscription(
  p_indicado_id uuid
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare v_indicador_id uuid;
begin
  update public.indicacoes
     set status = 'pago', pago_em = now()
   where indicado_id = p_indicado_id and status = 'pendente'
  returning indicador_id into v_indicador_id;

  if v_indicador_id is null then
    return false;
  end if;

  update public.profiles
     set creditos_indicacao = coalesce(creditos_indicacao, 0) + 1
   where id = v_indicador_id;
  return true;
end;
$$;

revoke all on function public.credit_referral_after_paid_subscription(uuid) from public, anon, authenticated;
grant execute on function public.credit_referral_after_paid_subscription(uuid) to service_role;

-- Atualiza o perfil e a sessão somente enquanto o checkout ainda aponta para
-- a mesma assinatura do evento. Isso impede que um evento atrasado altere uma
-- assinatura nova do mesmo usuário.
create or replace function public.apply_mp_preapproval_status(
  p_user_id uuid,
  p_preapproval_id text,
  p_plano text,
  p_assinatura_status text,
  p_recorrencia text,
  p_inicio timestamptz,
  p_proxima_cobranca timestamptz,
  p_payer_id text
) returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
     set plano = p_plano,
         assinatura_status = p_assinatura_status,
         assinatura_recorrencia = coalesce(p_recorrencia, assinatura_recorrencia),
         assinatura_inicio = coalesce(p_inicio, assinatura_inicio),
         assinatura_proxima_cobranca = coalesce(p_proxima_cobranca, assinatura_proxima_cobranca),
         mp_preapproval_id = p_preapproval_id,
         mp_payer_id = coalesce(p_payer_id, mp_payer_id)
   where id = p_user_id
     and (
       mp_preapproval_id = p_preapproval_id
       or exists (
         select 1 from public.mp_checkout_sessions
          where user_id = p_user_id and mp_preapproval_id = p_preapproval_id
       )
     );

  if not found then
    return false;
  end if;

  update public.mp_checkout_sessions
     set status = 'completed', updated_at = now()
   where user_id = p_user_id and mp_preapproval_id = p_preapproval_id;
  return true;
end;
$$;

revoke all on function public.apply_mp_preapproval_status(uuid, text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_mp_preapproval_status(uuid, text, text, text, text, timestamptz, timestamptz, text) to service_role;

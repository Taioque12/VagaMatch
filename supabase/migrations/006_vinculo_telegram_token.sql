-- Vínculo do Telegram por deep link (t.me/<bot>?start=<token>).
-- Pré-requisito: 005 (grants por coluna em profiles/vagas_vistas) já aplicada.
--
-- Modelo de segurança:
--   - O cliente NUNCA escolhe nem lê o valor do token direto na tabela: só via RPC
--     security definer, que gera o valor server-side (gen_random_uuid).
--   - telegram_chat_id deixa de ser gravável pelo usuário: só o webhook (service_role)
--     escreve, após validar o token. Elimina spoofing de chat_id de terceiros.
--   - Token expira em 15 minutos e é de uso único (apagado após o vínculo).

-- 1) telegram_chat_id sai da lista de colunas editáveis pelo usuário.
revoke update on public.profiles from authenticated;
grant update (nome_completo, localizacao) on public.profiles to authenticated;

-- 2) Um chat do Telegram pertence a no máximo um perfil (o webhook trata a violação 23505).
create unique index if not exists profiles_telegram_chat_id_unico
  on public.profiles (telegram_chat_id)
  where telegram_chat_id is not null;

-- 3) Tokens de vínculo — 1 token vigente por usuário (upsert renova valor + validade).
create table if not exists public.telegram_link_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

alter table public.telegram_link_tokens enable row level security;
-- Sem policies para anon/authenticated de propósito: RLS ativado + zero policies = acesso
-- direto negado. Cliente usa a RPC; webhook usa service_role (bypassa RLS).
grant all on public.telegram_link_tokens to service_role;

-- 4) RPC chamada pelo onboarding: gera/renova o token do usuário logado e o devolve.
create or replace function public.gerar_token_telegram()
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  novo uuid;
begin
  if auth.uid() is null then
    raise exception 'autenticação necessária';
  end if;

  insert into public.telegram_link_tokens as t (user_id)
  values (auth.uid())
  on conflict (user_id) do update
    set token = gen_random_uuid(),
        expires_at = now() + interval '15 minutes'
  returning t.token into novo;

  return novo;
end;
$$;

revoke execute on function public.gerar_token_telegram() from public, anon;
grant execute on function public.gerar_token_telegram() to authenticated;

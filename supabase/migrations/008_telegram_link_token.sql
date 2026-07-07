-- Hoje o onboarding pede pro usuário descobrir o próprio chat_id manualmente (via
-- @userinfobot) e colar num campo de texto — fricção alta e ponto comum de abandono.
-- telegram_link_token permite um deep link (t.me/<bot>?start=<token>) que vincula
-- automaticamente ao mandar /start pro bot. O campo manual continua existindo (não é
-- removido) como alternativa pra quem preferir.
--
-- É um token tipo "senha de vínculo": quem souber o valor consegue redirecionar as
-- notificações (que incluem o currículo gerado) daquele perfil pro próprio chat. Por isso é
-- rotacionado (novo valor gerado) a cada vínculo bem-sucedido — o link de cada pessoa só
-- funciona uma vez; se vazar um link antigo depois de usado, ele já não serve mais.
alter table public.profiles
  add column if not exists telegram_link_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_telegram_link_token_idx
  on public.profiles (telegram_link_token);

comment on column public.profiles.telegram_link_token is
  'Token de vínculo do Telegram via deep link (t.me/<bot>?start=<token>). Rotacionado a cada vínculo bem-sucedido — de uso único.';

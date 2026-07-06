# VagaMatch

SaaS multi-tenant derivado de `automacao-vagas` (projeto pessoal). Cada usuário se cadastra, configura o próprio currículo-base e preferências, e recebe vagas relevantes com currículo ajustado — sistema nunca aplica automaticamente, só notifica.

Ver [ROADMAP.md](./ROADMAP.md) pras fases planejadas e [DESIGN.md](./DESIGN.md) pro racional visual
da landing page. **Fases 1, 2 e 3 concluídas** (falta configurar secrets de produção, testar o
worker de ponta a ponta em produção, e decidir/implementar billing real).

## Stack

- **Frontend:** React + Vite + React Router + Supabase Auth (RLS)
- **Worker:** Node.js (pasta `worker/`), roda via GitHub Actions cron, usa a service_role key (ignora RLS — escreve em nome de todos os usuários)

## O que já existe

**Fase 1 — Fundação multi-tenant:**
- Schema (`supabase/migrations/`): `profiles`, `curriculos`, `preferencias`, `vagas_vistas`, `app_state` — tudo isolado por `user_id` via RLS
- Cadastro/login (Supabase Auth)
- Onboarding: formulário estruturado de currículo + preferências + vínculo do Telegram
- Dashboard: lista de vagas por usuário, com score/status/feedback

**Fase 2 — Pipeline multi-usuário (`worker/`):**
- Busca (Adzuna + JSearch opcional) usando os cargos-alvo/regiões de cada usuário ativo
- **Cache de busca compartilhado por cargo+região+raio entre usuários** — evita 1 request por
  pessoa na Adzuna/JSearch, crítico pra escalar volume (ver `worker/index.js`)
- Modo de região por usuário: raio ao redor da própria região, ou Brasil todo (`preferencias.modo_regiao`)
- Modo de disparo manual via bot (`/buscar`) além do automático a cada ciclo do cron
- Bot Telegram com comandos `/menu`, `/buscar`, `/regiao` e botões inline
- Score + dedup por usuário
- Currículo ajustado via Gemini (resumo profissional forçado a 5 linhas), construído a partir do
  currículo estruturado salvo no onboarding
- Notificação por Telegram (docx + pdf, botões de feedback 👍/👎) — **1 bot só, roteado por `telegram_chat_id`** de cada perfil
- Digest quando há mais de uma vaga nova por usuário
- Alerta de erro por usuário (e opcionalmente um chat de admin pra falhas fatais)

**Fase 3 — Painel web e landing page:**
- Landing page pública em `/` (ver [DESIGN.md](./DESIGN.md) e [LANDING_PROMPT.md](./LANDING_PROMPT.md))
- Dashboard do usuário em `/dashboard`
- Painel `/admin` (métricas de usuários/assinatura/saúde do sistema) restrito a `profiles.role = 'admin'`

## Status Atual

**🎉 BETA GRATUITO NO AR!**
A plataforma está oficialmente configurada e hospedada. O sistema completo de ponta-a-ponta (Site -> Banco de Dados -> Worker -> Telegram) está operante em Produção.

## Próximos passos (em ordem sugerida)

1. **Testar com usuários reais (Beta Fechado)**: Distribuir o link da Vercel para uma base controlada de usuários testadores para validar o onboarding, a qualidade do currículo gerado e a experiência de receber vagas pelo Telegram.
2. **Decidir gateway de pagamento (Fase 5)**: Integrar Checkout e Webhooks (Mercado Pago, Stripe ou Kiwify) para travar a plataforma apenas para assinantes pagantes.
3. **Definir preço final dos planos** (hoje ilustrativo em `src/lib/planos.js`) e implementar o billing real — `profiles.assinatura_status` hoje é atualizado manualmente no Supabase.
4. **Trocar conteúdo ilustrativo da landing por dado real**: Gravar um vídeo ou gif do fluxo real (bot mandando vaga+currículo no Telegram) e atualizar as métricas visuais da página inicial.
5. **Migrar o worker do GitHub Actions** para um cron dedicado (Railway/Render) caso a base de usuários cresça a ponto de o free-tier do GitHub Actions ser insuficiente.

## Setup local — Frontend

1. `npm install`
2. Projeto Supabase **dedicado** (não reusar o do `automacao-vagas` pessoal)
3. Rodar as migrations (`supabase/migrations/`, em ordem) no SQL Editor
4. Em **Authentication → Sign In / Providers**, decidir se exige confirmação de e-mail (desligar facilita testar)
5. Copiar `.env.example` → `.env`, preencher `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (a **publishable/anon**, não a secret)
6. `npm run dev`
7. Pra acessar `/admin`: depois de criar sua conta normalmente, rode no SQL Editor do Supabase
   `update public.profiles set role = 'admin' where id = '<seu-user-id>';`

## Setup local — Worker

1. No mesmo `.env`, preencher: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `RAPIDAPI_KEY` (opcional), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (a **secret**, não a publishable), `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`
2. Precisa de pelo menos 1 usuário com `preferencias.ativo = true`, cargos-alvo + palavras-chave preenchidos, e `telegram_chat_id` salvo no perfil (feito via onboarding)
3. `npm run worker:test` (roda com `--limit 2`) ou `npm run worker`

## Produção (GitHub Actions)

`.github/workflows/worker.yml` roda o worker a cada 2h. Cadastrar os secrets do worker em **Settings → Secrets and variables → Actions** do repo (mesmos nomes do `.env.example`, seção worker).

## Regras herdadas do projeto pessoal

- Nunca candidata automaticamente — só notifica
- Nunca inventa experiência além do que o usuário preencheu no próprio currículo
- Só APIs oficiais de busca de vagas

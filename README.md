# VagaMatch

SaaS multi-tenant derivado de `automacao-vagas` (projeto pessoal). Cada usuário se cadastra, configura o próprio currículo-base e preferências, e recebe vagas relevantes com currículo ajustado — sistema nunca aplica automaticamente, só notifica.

Ver [ROADMAP.md](./ROADMAP.md) pras fases planejadas. **Fase 1 e Fase 2 concluídas** (falta configurar secrets de produção e testar o worker de ponta a ponta).

## Stack

- **Frontend:** React + Vite + React Router + Supabase Auth (RLS)
- **Worker:** Node.js (pasta `worker/`), roda via GitHub Actions cron, usa a service_role key (ignora RLS — escreve em nome de todos os usuários)

## O que já existe

**Fase 1 — Fundação multi-tenant:**
- Schema (`supabase/migrations/001_schema.sql` + `002_app_state.sql`): `profiles`, `curriculos`, `preferencias`, `vagas_vistas`, `app_state` — tudo isolado por `user_id` via RLS
- Cadastro/login (Supabase Auth)
- Onboarding: formulário estruturado de currículo + preferências + vínculo do Telegram
- Dashboard: lista de vagas por usuário, com score/status/feedback

**Fase 2 — Pipeline multi-usuário (`worker/`):**
- Busca (Adzuna + JSearch opcional) usando os cargos-alvo/regiões de cada usuário ativo
- Score + dedup por usuário
- Currículo ajustado via Gemini, construído a partir do currículo estruturado salvo no onboarding (não mais um arquivo fixo)
- Notificação por Telegram (docx + pdf, botões de feedback 👍/👎) — **1 bot só, roteado por `telegram_chat_id`** de cada perfil
- Digest quando há mais de uma vaga nova por usuário
- Alerta de erro por usuário (e opcionalmente um chat de admin pra falhas fatais)

## O que falta (próximas fases)

- Testar o worker em produção com usuário real (secrets ainda não configurados no GitHub)
- Painel web mais completo (Fase 3)
- Billing/limites de uso (Fase 4)

## Setup local — Frontend

1. `npm install`
2. Projeto Supabase **dedicado** (não reusar o do `automacao-vagas` pessoal)
3. Rodar as migrations (`supabase/migrations/`, em ordem) no SQL Editor
4. Em **Authentication → Sign In / Providers**, decidir se exige confirmação de e-mail (desligar facilita testar)
5. Copiar `.env.example` → `.env`, preencher `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (a **publishable/anon**, não a secret)
6. `npm run dev`

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

# VagaMatch

SaaS multi-tenant que conecta candidatos a vagas de emprego usando Inteligência Artificial. Cada usuário se cadastra, faz upload do currículo (a IA extrai tudo automaticamente), configura preferências, e recebe vagas relevantes com currículo ajustado no Telegram — o sistema nunca aplica automaticamente, só notifica.

🔗 **Acesse:** https://vaga-match-coral.vercel.app/
🤖 **Bot Telegram:** [@vagamatchbr_bot](https://t.me/vagamatchbr_bot)

Ver [ROADMAP.md](./ROADMAP.md) pras fases planejadas e [DESIGN.md](./DESIGN.md) pro racional visual da landing page.

## Stack

| Camada | Tecnologia |
|---|---|
| **Frontend** | React + Vite + React Router + Supabase Auth (RLS) |
| **Worker** | Node.js (`worker/`), GitHub Actions cron a cada 10 min, service_role key |
| **Edge Functions** | `gemini-proxy` (proxy autenticado pro Gemini), `stripe-checkout` / `stripe-webhook` (pagamentos), `telegram-webhook` (respostas instantâneas do bot) |
| **Banco de Dados** | Supabase (PostgreSQL) com RLS por `user_id` |
| **IA** | Google Gemini 2.5 Flash (análise de vagas + extração de currículo) |
| **Pagamentos** | Stripe Checkout + Webhooks |
| **Deploy** | Vercel (frontend) + Supabase (Edge Functions + DB) + GitHub Actions (worker cron) |

## Funcionalidades

### 🧠 Onboarding Inteligente (Smart Extraction)
- Upload de PDF do currículo → a IA (Gemini) extrai automaticamente: nome, cargo, habilidades, experiências, cargos-alvo e palavras-chave
- O usuário não precisa digitar nada manualmente

### 🔍 Pipeline de Busca com IA
- Busca vagas na Adzuna usando cargos-alvo e regiões de cada usuário (raio padrão de 500km)
- Cache de busca compartilhado entre usuários com mesma região/cargo
- Filtro Híbrido: varredura de palavras-chave + análise profunda via **Gemini 2.5 Flash**
- A IA lê a descrição da vaga e o currículo, gera um **Score (0-100)** e uma justificativa
- Descarte automático de vagas com Score IA < 40

### 📱 Bot Telegram (Tempo Real)
- **Webhook em tempo real** via Supabase Edge Function — respostas instantâneas
- Comandos: `/start`, `/menu`, `/buscar`, `/status`, `/regiao`
- Botões inline: **✅ Candidatei-me** / **🗑️ Descartar** (gravam direto no banco)
- Notificações trazem: arquivo DOCX/PDF personalizado, Score IA e justificativa
- Link clicável para a vaga original na Adzuna
- Configuração de raio de busca (100km, 500km ou Brasil todo)

### 💎 Dashboard Premium
- Interface com Glassmorphism, grid de vagas, filtros rápidos
- Exibição do Score IA com cores e motivo da recomendação
- Dark/Light mode com CSS variables
- Download do currículo em PDF

### 💳 Pagamentos (Stripe)
- Integração completa: `stripe-checkout` (Edge Function) + `stripe-webhook`
- Páginas de sucesso e cancelamento
- Controle de plano (`free` / `premium`) no perfil do usuário

### 🛡️ Segurança & Robustez
- **RLS reforçado**: triggers bloqueiam usuário comum de alterar colunas privilegiadas (`role`, `plano`, etc.)
- **Gemini API key fora do bundle**: chamadas passam pela Edge Function `gemini-proxy` (autenticada via JWT)
- **Rate limiting**: 10 requisições/minuto por usuário (HTTP 429)
- **Request timeout**: chamadas Gemini com timeout 30s (AbortController)
- **Schema validation**: extração de currículo valida campos obrigatórios
- **Raio de busca**: default 500km, validação máxima 5000km

## Migrations (Banco de Dados)

As migrations estão em `supabase/migrations/`, em ordem:

| # | Arquivo | Descrição |
|---|---|---|
| 001 | `001_init.sql` | Schema inicial: `profiles`, `curriculos`, `preferencias`, `vagas_vistas`, `app_state` |
| 002 | `002_vagas_vistas_additions.sql` | Adições à tabela de vagas vistas |
| 003 | `003_disparo_regiao.sql` | Modo de disparo + região com raio |
| 004 | `004_motivo_ia.sql` | Coluna `motivo_ia` para justificativa da IA |
| 005 | `005_callback_id.sql` | `callback_id` para botões do Telegram |
| 006 | `006_fix_privilege_escalation.sql` | Triggers de segurança anti-escalação |
| 007 | `007_stripe_billing.sql` | Campos de billing Stripe no perfil |
| 008 | `008_fix_status_constraint.sql` | Fix constraint de status `pendente_processamento` |
| 009 | `009_default_raio_500.sql` | Raio padrão alterado para 500km |

## Setup Local — Frontend

1. `npm install`
2. Copiar `.env.example` → `.env`, preencher `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
3. `npm run dev`
4. Para acessar `/admin`: rode no SQL Editor do Supabase:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE id = '<seu-user-id>';
   ```

## Setup Local — Worker

1. No mesmo `.env`, preencher:
   - `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `RAPIDAPI_KEY` (opcional)
2. Pelo menos 1 usuário com `preferencias.ativo = true`, cargos-alvo preenchidos, e `telegram_chat_id` salvo
3. `npm run worker`

## Produção

### GitHub Actions (Worker Cron)
`.github/workflows/worker.yml` roda o worker a cada 10 min. Cadastrar secrets em **Settings → Secrets → Actions**:
`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`

### Supabase Edge Functions
Secrets necessários (`supabase secrets set`):
`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Telegram Webhook
O webhook é registrado via script `worker/test-webhook.js` apontando para:
`https://<project-ref>.supabase.co/functions/v1/telegram-webhook`

## Regras do Projeto

- ❌ Nunca candidata automaticamente — só notifica
- ❌ Nunca inventa experiência além do que o usuário preencheu
- ✅ Só APIs oficiais de busca de vagas

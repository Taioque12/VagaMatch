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
- Interface interativa que permite ao usuário **editar as tags geradas pela IA** antes de salvar, garantindo total controle
- O usuário não precisa preencher formulários manualmente

### 🔍 Pipeline de Busca com IA
- Busca vagas na Adzuna usando cargos-alvo e regiões de cada usuário (raio padrão de 500km)
- Cache de busca compartilhado entre usuários com mesma região/cargo
- Filtro Híbrido: varredura de palavras-chave + análise profunda via **Gemini 2.5 Flash**
- A IA lê a descrição da vaga e o currículo, gera um **Score (0-100)** e uma justificativa
- Descarte automático de vagas com Score IA < 40
- **Priorização Inteligente:** Novos cadastros ou uploads de currículo "furam a fila" e recebem as vagas quase que instantaneamente no próximo ciclo do worker
- **Reprocessamento Automático:** Vagas interrompidas no meio do processo (ex: geração de currículo falhou) são reprocessadas de forma segura via Upsert sem travar o pipeline.

### 📱 Bot Telegram (Tempo Real)
- **Login em 1-Clique:** Integração via *Deep Linking* (`/start {user_id}`). O site atualiza automaticamente via **Supabase Realtime** quando a conexão é feita
- **Webhook em tempo real** via Supabase Edge Function — respostas instantâneas
- Comandos: `/start`, `/menu`, `/buscar`, `/status`, `/regiao`
- Botões inline: **✅ Candidatei-me** / **🗑️ Descartar** (gravam direto no banco)
- Notificações trazem: currículo em **PDF exclusivo e ajustado para a vaga**, Score IA e justificativa, enviados diretamente no chat
- Link clicável para a vaga original na Adzuna
- Configuração de raio de busca (100km, 500km ou Brasil todo)

### 💎 Dashboard Premium
- Painel Web principal (`/dashboard`) com Glassmorphism, grid de vagas, e filtros rápidos (acessado automaticamente após o onboarding)
- Exibição do Score IA com cores e motivo da recomendação gerado pela IA
- Dark/Light mode com CSS variables
- Download do currículo em PDF

### 💳 Pagamentos (Stripe)
- Integração completa: `stripe-checkout` (Edge Function) + `stripe-webhook`
- Páginas de sucesso e cancelamento
- Controle de plano (`free` / `premium`) no perfil do usuário

### 🛡️ Segurança & Robustez
- **RLS reforçado**: triggers bloqueiam usuário comum de alterar colunas privilegiadas (`role`, `plano`, etc.)
- **Gemini API key fora do bundle**: chamadas passam pela Edge Function `gemini-proxy` (autenticada via JWT)
- **Webhook do Telegram autenticado**: `telegram-webhook` valida o header `X-Telegram-Bot-Api-Secret-Token` (env `TELEGRAM_WEBHOOK_SECRET`) — sem isso, updates forjados conseguiam alterar preferências de qualquer usuário
- **Whitelist de modelo Gemini**: `gemini-proxy` só aceita modelos pré-aprovados (o campo `model` ia direto pro path da URL da API)
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
`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_WEBHOOK_SECRET`

### Telegram Webhook
Registrado via `setWebhook` apontando para `https://<project-ref>.supabase.co/functions/v1/telegram-webhook`, com `secret_token` igual ao `TELEGRAM_WEBHOOK_SECRET` configurado nas secrets:
```
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"<SUPABASE_URL>/functions/v1/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```
Depois de trocar o secret, é preciso redeployar `telegram-webhook` e re-registrar o webhook com o novo valor.

## Testes

- `npm test` (vitest) — `src/lib/gemini.test.js`: extração de currículo, validação de schema, timeout do Gemini
- `gemini-proxy/index.test.ts` roda com `deno test`, não com vitest (excluído em `vite.config.js`)
- `worker/test-*.js` são scripts manuais de diagnóstico (sem assertions), rodam com `node worker/test-<nome>.js`

## Regras do Projeto

- ❌ Nunca candidata automaticamente — só notifica
- ❌ Nunca inventa experiência além do que o usuário preencheu
- ✅ Só APIs oficiais de busca de vagas

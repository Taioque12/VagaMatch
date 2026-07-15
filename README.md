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
- Notificações trazem Score IA e justificativa; o **currículo ajustado é gerado on-demand** só quando o usuário clica "Candidatei-me" (corta o custo Gemini pela metade no pipeline)
- Link clicável para a vaga original na Adzuna
- Configuração de raio de busca (100km, 500km ou Brasil todo)

### 🎤 Entrevista Simulada por IA (MVP em texto)
- Após receber o currículo ajustado, o bot oferece treinar a entrevista daquela vaga
- A IA faz papel de recrutador: 1 pergunta por vez (técnica ou comportamental), baseada na descrição da vaga + currículo do candidato
- Feedback construtivo a cada resposta; ao final (5 perguntas), avaliação geral com nota
- `/parar` encerra a sessão a qualquer momento
- Anti-abuso: máximo de 3 entrevistas por usuário por semana, 1 sessão ativa por vez

### 💰 Market Value & Gamificação
- Card no dashboard mostra a média salarial das vagas encontradas para o perfil do usuário
- Salários (`salario_min`/`salario_max`) persistidos das APIs Adzuna/JSearch
- Dica de upsell incentivando adicionar habilidades para subir de nível

### 🤝 Sistema de Indicação (anti-fraude)
- Código de indicação único por usuário; link `cadastro?ref=<codigo>` no dashboard
- Crédito só é liberado quando o indicado **paga a primeira mensalidade** (via webhook Stripe) — contas fake não geram recompensa
- Contador de créditos visível no dashboard

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
- **RLS reforçado**: triggers bloqueiam usuário comum de alterar colunas privilegiadas (`role`, `plano`, créditos de indicação, salários); status de vaga só aceita `candidatado`/`descartada` vindos do usuário
- **Preço server-side**: `stripe-checkout` define o price via env (`STRIPE_PRICE_ID_MENSAL`/`ANUAL`) — o client escolhe só o plano, nunca o priceId
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
| 010 | `010_salarios_vagas.sql` | Colunas `salario_min`/`salario_max` em `vagas_vistas` |
| 011 | `011_indicacoes.sql` | Sistema de indicação: código único, tabela `indicacoes`, RPC `registrar_indicacao` |
| 012 | `012_fix_protecao_colunas.sql` | Protege colunas de indicação/salário; destrava status `candidatado`/`descartada` pro usuário |
| 013 | `013_descricao_vaga.sql` | Coluna `descricao` em `vagas_vistas` (CV on-demand e entrevista) |
| 014 | `014_entrevistas.sql` | Tabela `entrevistas` (sessões da entrevista simulada, cota e histórico) |

## Ferramentas de Desenvolvimento (IA)

Num PC novo, **um comando instala e configura tudo** (idempotente — nunca sobrescreve a config versionada):

```bash
npm run setup:ia
```

Isso instala/inicia:
- **claude-mem** — memória persistente entre sessões do Claude Code. UI: http://127.0.0.1:37777 · dados locais em `~/.claude-mem`. Opcional: `/learn-codebase` numa sessão pra ingerir o repo inteiro de uma vez.
- **ruflo** — orquestração de agentes (swarms, memória vetorial, MCP). Os padrões do projeto (CLAUDE.md, `.claude/` com skills/commands/agents, `.mcp.json`) **já vêm do git** — é isso que mantém o mesmo comportamento em qualquer máquina; o script só cria o runtime local que falta.

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
`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MENSAL` (e opcional `STRIPE_PRICE_ID_ANUAL`), `SITE_URL`

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

## Próximos Passos

### Pendências imediatas (bloqueiam testes fim-a-fim)
- [ ] Configurar secret `STRIPE_PRICE_ID_MENSAL` nas Edge Functions (sem ele o botão "Assinar Premium" falha)
- [ ] Testar worker com `.env` real (`node worker/index.js --limit 3`) — validar salários e `descricao` populando
- [ ] Testar fluxo completo no Telegram: "Candidatei-me" → CV on-demand → oferta de entrevista → sessão completa
- [ ] Testar indicação fim-a-fim: cadastro com `?ref=`, checkout test do Stripe, crédito no indicador
- [ ] Revisão visual do dashboard com prints (aguardando `.env` do frontend)

### Roadmap v2 (ver `docs/plano_gamificacao.md` e análise de escala)
- [ ] **Resgate de créditos de indicação** — hoje só contabiliza; decidir: cupom Stripe automático ou resgate manual
- [ ] **Market Value global** — média de mercado agregada (Materialized View / cache 12h) além da média pessoal
- [ ] **Viralização** — imagens compartilháveis (Vercel OG) com o market value do usuário
- [ ] **Entrevista por voz** — evoluir o MVP de texto (requer fila + cotas por plano premium)
- [ ] **Extensão Chrome** ("assassino da Gupy") — auto-preenchimento local, token de curta duração
- [ ] **B2B Painel de Recrutadores** — perfis anonimizados, opt-in de contato, RLS dedicada (LGPD)
- [ ] **Gate premium na entrevista simulada** — hoje cota única (3/semana) pra todos; ligar por plano quando houver tração

## Regras do Projeto

- ❌ Nunca candidata automaticamente — só notifica
- ❌ Nunca inventa experiência além do que o usuário preencheu
- ✅ Só APIs oficiais de busca de vagas

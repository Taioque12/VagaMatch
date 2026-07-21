# VagaMatch

SaaS multi-tenant que conecta candidatos a vagas de emprego usando Inteligência Artificial. Cada usuário se cadastra, faz upload do currículo (a IA extrai tudo automaticamente), configura preferências, e recebe vagas relevantes com currículo ajustado no Telegram — o sistema nunca aplica automaticamente, só notifica.

🔗 **Acesse:** https://vaga-match-coral.vercel.app/
🤖 **Bot Telegram:** [@vagamatchbr_bot](https://t.me/vagamatchbr_bot)

Ver [ROADMAP.md](./ROADMAP.md) pras fases planejadas e [DESIGN.md](./DESIGN.md) pro racional visual da landing page.

## Stack

| Camada | Tecnologia |
|---|---|
| **Frontend** | React + Vite (lazy routes) + React Router + Supabase Auth (RLS) |
| **Worker** | Node.js (`worker/`), GitHub Actions cron a cada 2h, service_role key |
| **Edge Functions** | `gemini-proxy` (proxy autenticado pro Gemini + embeddings), `mp-checkout` / `mp-webhook` (pagamentos), `telegram-webhook` (bot + geração de PDF on-demand) |
| **Banco de Dados** | Supabase (PostgreSQL) com RLS por `user_id` + **pgvector** (embeddings 768d, índices HNSW) |
| **IA** | Google Gemini 2.5 Flash (score swarm Técnico+Fit, currículo ajustado, extração) + text-embedding (pré-filtro vetorial V3) |
| **Pagamentos** | Mercado Pago (preapproval/Pix) — Edge Functions `mp-checkout`/`mp-webhook` |
| **Deploy** | Vercel (frontend) + Supabase (Edge Functions + DB) + GitHub Actions (worker cron) |

## Funcionalidades

### 🧠 Onboarding Inteligente (Smart Extraction)
- Upload de PDF do currículo → a IA (Gemini) extrai automaticamente: nome, cargo, habilidades, experiências, cargos-alvo e palavras-chave
- Interface interativa que permite ao usuário **editar as tags geradas pela IA** antes de salvar, garantindo total controle
- O usuário não precisa preencher formulários manualmente

### 🔍 Pipeline de Busca com IA (V3 — Agentes Inteligentes)
- Busca em 4 fontes (Adzuna, JSearch, Reed, Jooble) usando cargos-alvo e regiões de cada usuário (raio padrão 500km ou Brasil todo)
- Cache de busca persistido (`app_state`, TTL 90min) compartilhado entre usuários com mesma região/cargo
- **Camada 0 — pré-filtro vetorial (pgvector)**: similaridade coseno currículo×vaga (embeddings 768d) descarta vagas ruins **antes** de gastar chamada Gemini; ajuste por memória de feedback (vaga parecida com descartes recentes é penalizada, parecida com candidaturas ganha bônus)
- **Camada 1 — swarm Técnico + Fit-Cultural**: 2 especialistas lógicos em 1 chamada Gemini, retornando `score_tecnico` + `score_fit`; score final é média ponderada com o sinal vetorial (pesos calibráveis a quente via `app_state`)
- Descarte automático de vagas com Score final < 40
- **Priorização Inteligente:** novos cadastros/uploads "furam a fila" no próximo ciclo do worker
- **Reprocessamento de órfãs:** vagas presas em `pendente_processamento` (rodada interrompida por timeout) são reincluídas automaticamente a cada rodada (até 30/rodada, idade > 1h)
- Lock de execução via `app_state` (timeout 15min) + semáforo de concorrência 3 + janela de 4s entre chamadas Gemini (15 RPM free tier); 429 nunca descarta vaga
- Flags a quente em `app_state`: `v3_prefiltro`, `v3_threshold_similaridade`, `v3_pesos_score`, `v3_fator_feedback`, `v3_pdf_automatico` — rollback sem deploy

### 📱 Bot Telegram (Tempo Real)
- **Login em 1-Clique:** Integração via *Deep Linking* (`/start {user_id}`). O site atualiza automaticamente via **Supabase Realtime** quando a conexão é feita
- **Webhook em tempo real** via Supabase Edge Function — respostas instantâneas
- Comandos: `/start`, `/menu`, `/buscar`, `/status`, `/regiao`
- Botões inline: **✅ Candidatei-me** / **🗑️ Descartar** / **📄 Gerar PDF** (gravam direto no banco; descarte/candidatura alimentam a memória vetorial de feedback da V3)
- Notificações trazem Score IA e o insight Técnico+Fit; o **PDF do currículo ajustado à vaga chega automático** logo após a notificação (desligável a quente via `v3_pdf_automatico`) — o botão "📄 Gerar PDF" regenera on-demand
- PDF em estrutura **ATS-friendly**: 1 coluna, Helvetica, texto selecionável, seções padrão de mercado, metadata (title/author) — mesmo layout nos 3 geradores (worker, webhook, site)
- Link clicável para a vaga original
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

### 💎 Dashboard Premium V2
- Coluna única 960px, dark mode esmeralda como padrão absoluto, glassmorphism (blur 24px)
- Hero "Taxa de Sucesso IA" + métricas (processadas, na fila) + toolbar com toggle de busca e filtros pill
- Score ring radial por vaga, box "Insight da IA", barras Técnico/Fit (sub-scores V3) e radar de médias (recharts)
- Micro-interações: shimmer nas métricas durante busca, hover esmeralda, avatar com iniciais no header
- Rotas lazy (React.lazy + Suspense) — chunk inicial menor pra Landing/Login
- Download do currículo em PDF (mesmo layout ATS do bot)

### 💳 Pagamentos (Mercado Pago)
- Edge Functions `mp-checkout` (JWT, preços server-side) + `mp-webhook` (validação x-signature HMAC + reconsulta à API antes de escrever)
- Planos `match`/`match_plus`; free = 1 busca automática/24h (trigger anti-bypass no banco)
- Páginas `/upgrade`, `/sucesso`, `/cancelado`

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
| 015 | `015_worker_retries.sql` | Coluna `tentativas` (max retries antes de status `erro`) |
| 016 | `016_mercadopago_billing.sql` | Migração Stripe→Mercado Pago: colunas `mp_*`, quota free 24h, trigger anti-bypass |
| 017 | `017_vetores.sql` | **V3 Fase A**: extensão pgvector, `embedding vector(768)` em `curriculos`/`vagas_vistas`, índices HNSW, RPC `match_vaga_curriculo`, flags V3 no `app_state` |
| 018 | `018_feedback_vetorial.sql` | **V3 Fase C**: `feedback_em`, RPC `ajuste_feedback_vetorial` (memória de descartes/candidaturas) |
| 019 | `019_protege_embedding.sql` | Blinda `vagas_vistas.embedding` contra escrita do usuário (trigger) |

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
`.github/workflows/worker.yml` roda o worker a cada 2h (`npm ci --omit=dev` com npm@11 pinado — evita divergência de lockfile entre versões de npm). Cadastrar secrets em **Settings → Secrets → Actions**:
`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `RAPIDAPI_KEY`, `ADMIN_TELEGRAM_CHAT_ID` (opcional, alertas)

### Supabase Edge Functions
Secrets necessários (`supabase secrets set`):
`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_WEBHOOK_SECRET`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SITE_URL`

### Telegram Webhook
Registrado via `setWebhook` apontando para `https://<project-ref>.supabase.co/functions/v1/telegram-webhook`, com `secret_token` igual ao `TELEGRAM_WEBHOOK_SECRET` configurado nas secrets:
```
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"<SUPABASE_URL>/functions/v1/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```
Depois de trocar o secret, é preciso redeployar `telegram-webhook` e re-registrar o webhook com o novo valor.

## Testes

`npm test` (vitest, 18 testes):
- `src/lib/gemini.test.js` — extração de currículo, validação de schema, timeout do Gemini
- `worker/processamento.test.js` — semáforo de concorrência, pipeline de vagas (aprovação/descarte por score, 429 não conta falha, PDF automático best-effort)
- `worker/db.test.js` — query de pendentes órfãs (`buscarPendentesAntigas`)

Edge Functions são excluídas do vitest (`vite.config.js`). Script de manutenção: `node scripts/reprocessar-pendentes.mjs` (desentope vagas presas em `pendente_processamento`, reusando o pipeline de produção).

## Próximos Passos

### Pendências imediatas
- [ ] Mercado Pago fim-a-fim: criar aplicação no painel do MP, setar `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET`, cadastrar URL do webhook e testar pagamento real
- [ ] Item 7 da V3: job semanal de refino de perfil (`resumirFeedbackSemanal` já existe em `worker/swarm.js`, falta o cron + confirmação do usuário no Telegram)
- [ ] Colunas dedicadas `score_tecnico`/`score_fit` em `vagas_vistas` (hoje o frontend parseia do texto `motivo_ia` — funciona, mas é frágil)

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

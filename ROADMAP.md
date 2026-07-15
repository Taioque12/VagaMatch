# VagaMatch — Roadmap

SaaS multi-tenant derivado do projeto pessoal `automacao-vagas`: monitora vagas, gera currículo ajustado por vaga, notifica o usuário. Aqui, qualquer pessoa se cadastra e configura o próprio perfil/currículo/preferências.

## O que muda em relação à versão pessoal

| Item | Versão pessoal (automacao-vagas) | VagaMatch (SaaS) |
|---|---|---|
| Currículo-base | Arquivo fixo `data/curriculo-base.md` | Cadastrado por usuário (form ou upload) |
| Cargos/palavras-chave/regiões | Fixos em `config.js` | Configuráveis por usuário |
| Notificação | Telegram de 1 pessoa | Telegram (chat_id vinculado no onboarding) por usuário |
| Dados (`vagas_vistas`) | Sem isolamento (1 usuário só) | `user_id` + RLS de verdade |
| Execução | GitHub Actions, cron único | Fila/worker por usuário — Actions não escala pra N usuários |
| Autenticação | Nenhuma | Supabase Auth (login) |
| Custo | Absorvido (tier grátis) | Precisa modelo de billing ou limite rígido por usuário |

## Fases propostas

### Fase 1 — Fundação multi-tenant ✅ concluída
- Supabase Auth (login/cadastro)
- Schema com `user_id` em todas as tabelas + RLS real
- Tela de onboarding: cadastro de currículo-base (formulário estruturado, não upload livre — mais fácil de validar e gerar CV depois) + cargos-alvo + regiões + link do Telegram
- Testado ponta a ponta com Supabase real

### Fase 2 — Pipeline multi-usuário ✅ concluída (worker construído, falta configurar secrets + testar em produção)
- `worker/` — reaproveita a lógica de `automacao-vagas` (busca Adzuna+JSearch, score, Gemini, docx+pdf, Telegram com feedback), adaptada pra iterar por usuário ativo (`preferencias.ativo = true` + `telegram_chat_id` vinculado)
- 1 bot Telegram serve todos os usuários — roteamento por `chat_id` salvo no perfil de cada um
- GitHub Actions (`worker.yml`, cron 2h) roda o worker usando a **service_role key** (ignora RLS, único jeito de escrever em nome de todo mundo)
- Secrets configurados, bot @Taioque_bot reusado (trocar por bot dedicado quando tiver branding), testado local e na nuvem ✅

### Fase 3 — Painel web ✅ concluída
- Dashboard completo: stats (encontradas/notificadas/candidatadas/descartadas), filtros por status, ações "Me candidatei"/"Descartar" direto no painel, toggle pausar/retomar busca automática
- Edição de currículo-base e preferências já coberta pelo onboarding (acessível via "Meu perfil")
- Testado com dados reais (vaga notificada pelo worker) — status/toggle persistem via RLS
- Landing page pública em `/` (design em [DESIGN.md](./DESIGN.md) e [LANDING_PROMPT.md](./LANDING_PROMPT.md))
- Painel `/admin` — métricas de usuários/assinatura/saúde do sistema, restrito a `role = 'admin'`
- Busca por região com raio configurável (ou Brasil todo) e disparo manual via bot, ambos
  configuráveis por botões no Telegram (`/regiao`, `/buscar`)
- Falta (fora do escopo da fase): deploy do frontend (Vercel) pra acesso público

### Fase 4 — Billing / limites 🔄 em andamento (código no ar, falta configurar Mercado Pago)
- Gateway escolhido: **Mercado Pago** (Pix/cartão, assinatura via preapproval)
- Implementado e deployado (2026-07-15):
  - Edge Functions `mp-checkout` (JWT, preços server-side) e `mp-webhook`
    (validação x-signature HMAC + reconsulta à API do MP antes de escrever)
  - Migration 016: colunas `mp_*`, `preferencias.ultima_busca_em`, CHECKs de
    plano/assinatura atualizados, trigger anti-bypass da quota free
  - Worker: plano free = 1 busca/24h (pagante sem limite)
  - Frontend: `/upgrade`, banner free no Dashboard, `/sucesso` tratando retorno do MP
  - Frontend em produção: https://vaga-match-taioques.vercel.app
- Pendente: criar aplicação no painel do Mercado Pago, setar secrets
  `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET`, cadastrar URL do webhook e testar
  pagamento real ponta a ponta

### Fase 5 — V3: Agentes Inteligentes (vetorização + swarm + aprendizado) ✅ implementada (rollout pendente: virar `v3_prefiltro` pra `on` no app_state)

Objetivo: substituir o score linear de `worker/ai_filter.js` (1 chamada Gemini por vaga,
gargalo de 15 RPM) por um pipeline em 3 camadas: pré-filtro vetorial barato, avaliação
multi-agente só nas vagas promissoras, e aprendizado contínuo com o feedback do Telegram.

**Decisão de infra (vetores)**: usar **Supabase pgvector**, não AgentDB local.
Motivo: o worker roda em GitHub Actions com filesystem efêmero — um `.agentdb/*.db`
local morreria a cada rodada. pgvector já vive no nosso Postgres, respeita RLS,
é multi-tenant nativo e não adiciona dependência de host. Os padrões das skills
(`agentdb-vector-search`, `reasoningbank-agentdb`) são aplicados como *modelo de dados
e fluxo* (embeddings + confidence + usage/success counts + MMR), com pgvector como backend.
AgentDB fica como otimização futura se o worker migrar pra host dedicado (Railway/Render).

**Embeddings**: `gemini-embedding-001` via mesma `GEMINI_API_KEY` (768 dims — bom
custo/benefício e índice menor). Free tier cobre o volume atual.

#### Fase A — Vetorização no upload
1. Migration `017_vetores.sql`:
   - `create extension if not exists vector;`
   - `curriculos.embedding vector(768)` — embedding do currículo-base consolidado
   - `vagas_vistas.embedding vector(768)` — embedding de `titulo + descricao`
   - `create index ... using hnsw (embedding vector_cosine_ops)` nas duas tabelas
   - RPC `match_vaga_curriculo(user_id, vaga_embedding)` → similaridade coseno
2. Onboarding (`extrairDadosCurriculo` já retorna JSON estruturado): após salvar o
   currículo, a Edge Function `gemini-proxy` ganha rota de embedding (ou nova função
   `embed-curriculo`) que gera e grava `curriculos.embedding`. Re-upload → re-embedding.
3. Worker: ao inserir vaga nova em `vagas_vistas`, gera embedding em batch
   (`batchEmbedContents`, até 100 textos/req — 1 chamada por rodada, não por vaga).

#### Fase B — Swarm de Recrutadores (pipeline em camadas)
Substitui `avaliarMatchComIA` por `worker/swarm/`:
1. **Camada 0 — pré-filtro vetorial (sem LLM)**: similaridade coseno currículo×vaga
   via pgvector. `< 0.55` → descarta direto (economiza a chamada Gemini que hoje é
   gasta em vaga ruim); `>= 0.55` → segue pro swarm. Esperado: corta 60-80% das chamadas.
2. **Camada 1 — swarm hierárquico** (topologia queen-worker das skills, implementada
   como orquestração de prompts no worker — sem daemon, sem processo extra):
   - **Agente Técnico**: skills/experiência vs requisitos → `score_tecnico` + gaps
   - **Agente Fit-Cultural**: senioridade, regime, região, faixa salarial vs
     preferências → `score_fit`
   - **Agente Redator**: só roda na Camada 2 (on-demand, botão "📄 Gerar PDF" — já
     é assim hoje; passa a receber os gaps do Agente Técnico pra destacar pontos fortes)
   - Técnico + Fit rodam em **1 única chamada Gemini** com saída JSON
     `{score_tecnico, score_fit, motivo}` — 2 "agentes" lógicos, 1 request (rate
     limit é o gargalo real; paralelismo de prompts dentro de 1 request é grátis).
   - Score final: `0.5*similaridade_vetorial + 0.3*score_tecnico + 0.2*score_fit`,
     pesos em `app_state` pra ajustar sem deploy.
3. Semáforo + janela de 4s do Gemini permanecem (já implementados no index.js).

#### Fase C — Aprendizado (ReasoningBank sobre pgvector)
1. Migration: tabela `memorias_feedback`
   (`user_id, vaga_id, tipo 'descarte'|'candidatura', embedding vector(768),
   confidence float, usage_count int, created_at`) — mesmo shape de pattern da skill.
2. Webhook Telegram, handler `st:desc:` (já existe): além de marcar `descartada`,
   grava memória negativa com o embedding da vaga (já calculado na Fase A — zero
   chamada extra). `st:cand:` grava memória positiva.
3. Worker, Camada 0 ganha segundo sinal: RPC `penalidade_descartes(user_id,
   vaga_embedding)` → média de similaridade com os últimos N descartes do usuário.
   Vaga muito parecida com o que ele já descartou → score penalizado
   (`score_final -= 15 * penalidade`); parecida com o que ele candidatou → bônus.
4. Refino automático do perfil: job semanal (mesmo worker) clusteriza descartes e
   sugere via Telegram: "Você descarta tudo de {padrão}. Remover das buscas?" —
   ajuste só com confirmação do usuário (evita feedback-loop que estreita demais).

#### Entregáveis e ordem
| # | Item | Risco |
|---|------|-------|
| 1 | Migration 017 (pgvector + colunas + índices + RPCs) | baixo |
| 2 | Embedding no upload (frontend/Edge) + backfill dos currículos existentes | baixo |
| 3 | Embedding batch de vagas no worker | baixo |
| 4 | Camada 0 (pré-filtro) atrás de flag `V3_PREFILTRO=on` em `app_state` | médio |
| 5 | Swarm Técnico+Fit substituindo `avaliarMatchComIA` (flag `V3_SWARM`) | médio |
| 6 | Memórias de feedback no webhook + penalidade na Camada 0 | médio |
| 7 | Job semanal de refino de perfil | baixo |

Rollout: cada etapa atrás de flag em `app_state`, produção continua no fluxo linear
até validarmos métricas (taxa de descarte pós-notificação deve CAIR; chamadas
Gemini/rodada devem cair >50%). Rollback = desligar flag.

## Decisão pendente

Fases 1-3 concluídas. Falta decidir, pra iniciar a Fase 4:
- Gateway de pagamento (Stripe cobre cartão internacional; Mercado Pago é mais familiar pro
  público BR e aceita Pix/boleto — considerar o método de pagamento que o público de baixa
  renda mais usa)
- Preço final dos planos (hoje ilustrativo em `src/lib/planos.js` — ver [DESIGN.md](./DESIGN.md))
- Deploy do frontend (Vercel) pra acesso público, e migração do worker do GitHub Actions pra
  um cron dedicado (Railway/Render) quando a base de usuários crescer — ver conversa sobre
  escala em memória do projeto

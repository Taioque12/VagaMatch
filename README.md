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
- Onboarding **(Smart Extraction)**: Usuário faz upload de PDF e a IA (Gemini) preenche automaticamente dados, experiências, cargos-alvo e palavras-chave.
- Dashboard Premium: Interface com Glassmorphism, grid de vagas, filtros rápidos e exibição do **Score da IA** e motivo.

**Fase 2 — Pipeline multi-usuário (`worker/`):**
- Busca (Adzuna + JSearch opcional) usando os cargos-alvo/regiões de cada usuário (raio default de 500km).
- **Cache de busca compartilhado** entre usuários pra mesma região/cargo.
- **Filtro Híbrido + IA (Novo):** Varredura de palavras-chave simples seguida de análise profunda usando o **Gemini 2.5 Flash**. A IA lê a descrição da vaga e o currículo, e gera um Score (0 a 100) e uma justificativa (`motivo_ia`).
- Descarte automático de vagas com Score IA < 40.
- Modo de disparo manual via bot (`/buscar`) além do automático a cada ciclo do cron.
- Bot Telegram com comandos `/menu`, `/buscar`, `/status`, `/regiao` e botões inline. Notificações trazem o arquivo DOCX/PDF gerado, o Score e a Justificativa da IA.

**Fase 3 — Painel web e landing page:**
- Landing page pública em `/` (ver [DESIGN.md](./DESIGN.md) e [LANDING_PROMPT.md](./LANDING_PROMPT.md))
- Dashboard do usuário em `/dashboard`
- Painel `/admin` (métricas de usuários/assinatura/saúde do sistema) restrito a `profiles.role = 'admin'`

## Status Atual

**🎉 BETA GRATUITO NO AR — v2 com IA Completa + Glassmorphism UI!**

Infraestrutura:
- ✅ Supabase: projeto `wrdxvhhmyptizlpdeaue`, schema com RLS e coluna `motivo_ia` migrada
- ✅ Vercel: frontend deployado em https://vaga-match-coral.vercel.app/
- ✅ Onboarding IA: O usuário não precisa mais digitar nada, envia o PDF e a IA extrai tudo (cargo, skill, resumo)
- ✅ Dashboard Premium: Redesign com Glassmorphism, Score IA com cores, e grid moderno
- ✅ Filtro de IA do Worker: Avaliação 0-100 via Gemini Flash para cada vaga encontrada, cortando spam
- ✅ Telegram Aprimorado: Mostra o `Score` e o "Porque essa vaga é pra você" direto no celular
- ✅ Theme toggle: dark/light mode com CSS variables
- ✅ Landing page: completa com features + pricing + ticker de vagas

## Próximos passos (em ordem sugerida)

1. **Rodar worker fim-a-fim**: Usuário preenche onboarding (currículo + preferências + telegram_chat_id), aguarda próximo cron (2h) ou dispara manual via GitHub Actions, valida se vaga chega no Telegram com CV ajustado.
2. **Beta Fechado com 5-10 testers**: Link Vercel distribuído, feedback em onboarding/CV quality/Telegram UX.
3. **Decidir gateway de pagamento (Fase 5)**: Integrar Checkout e Webhooks (Mercado Pago, Stripe ou Kiwify).
4. **Definir preço final dos planos** (hoje ilustrativo em `src/lib/planos.js`) e implementar o billing real — `profiles.assinatura_status` hoje é atualizado manualmente no Supabase.
5. **Trocar conteúdo ilustrativo da landing por dado real**: Vídeo/gif do fluxo real (bot mandando vaga+currículo no Telegram) e atualizar métricas.

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

`.github/workflows/worker.yml` roda o worker a cada 10 min. Cadastrar os secrets do worker em **Settings → Secrets and variables → Actions** do repo (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`).

## Regras herdadas do projeto pessoal

- Nunca candidata automaticamente — só notifica
- Nunca inventa experiência além do que o usuário preencheu no próprio currículo
- Só APIs oficiais de busca de vagas

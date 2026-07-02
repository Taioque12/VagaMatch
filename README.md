# VagaMatch

SaaS multi-tenant derivado de `automacao-vagas` (projeto pessoal). Cada usuário se cadastra, configura o próprio currículo-base e preferências, e recebe vagas relevantes com currículo ajustado — sistema nunca aplica automaticamente, só notifica.

Ver [ROADMAP.md](./ROADMAP.md) pras fases planejadas. **Fase 1 (fundação multi-tenant) em andamento.**

## Stack

React + Vite + React Router + Supabase (Auth + Postgres com RLS).

## O que já existe (Fase 1)

- Schema multi-tenant (`supabase/migrations/001_schema.sql`): `profiles`, `curriculos`, `preferencias`, `vagas_vistas` — tudo isolado por `user_id` via RLS
- Cadastro/login (Supabase Auth)
- Onboarding: formulário estruturado de currículo (resumo, habilidades, experiências, formação, cursos, projetos) + preferências (cargos-alvo, palavras-chave, regiões) + vínculo do Telegram
- Dashboard: lista de vagas encontradas por usuário, com score/status/feedback

## O que falta (próximas fases)

- Worker que processa o pipeline por usuário (hoje o `automacao-vagas` pessoal roda sozinho; aqui precisa iterar por todos os usuários ativos)
- Geração de currículo (Gemini) e notificação (Telegram) adaptadas pra multi-usuário — reaproveitar lógica de `automacao-vagas/src/curriculo.js`, `telegram.js`, `docx.js`, `pdf.js`
- Billing/limites de uso

## Setup local

1. `npm install`
2. Criar um projeto Supabase **dedicado** (não reusar o do `automacao-vagas` pessoal — dados de usuários diferentes não devem compartilhar banco)
3. Rodar `supabase/migrations/001_schema.sql` no SQL Editor
4. Em **Authentication → Providers**, confirmar que Email está habilitado. Em **Authentication → Settings**, decidir se exige confirmação de e-mail (recomendado desligar durante desenvolvimento pra testar mais rápido)
5. Copiar `.env.example` → `.env`, preencher com URL + **anon key** (não a service_role — o frontend usa a chave pública, protegida pelo RLS)
6. `npm run dev`

## Regras herdadas do projeto pessoal

- Nunca candidata automaticamente — só notifica
- Nunca inventa experiência além do que o usuário preencheu no próprio currículo
- Só APIs oficiais de busca de vagas

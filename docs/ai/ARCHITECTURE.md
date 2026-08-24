# Arquitetura atual — VagaMatch

Baseado exclusivamente no código local, auditado em 2026-08-08.

```text
Browser (Vite + React + React Router)
  ├─ Supabase Auth / Postgres (RLS)
  │    ├─ profiles, curriculos, preferencias, vagas_vistas
  │    ├─ app_state (lock/cache/configuração do worker)
  │    └─ pgvector (embeddings de currículo e vaga)
  └─ Edge Function gemini-proxy ──> Google Gemini

GitHub Actions cron (a cada 2 h) ──> worker Node.js
  ├─ Adzuna / JSearch via RapidAPI / Reed / Jooble
  ├─ Supabase (service_role)
  ├─ Google Gemini (matching, embeddings, currículo)
  └─ Telegram Bot API

Telegram ──> Edge Function telegram-webhook (service_role)
Pagamentos: React ──> mp-checkout / stripe-checkout; webhooks ──> profiles
Vercel hospeda o SPA via rewrite para index.html.
```

## Componentes e responsabilidades

- `src/`: SPA React. Cadastro/login, onboarding via PDF, dashboard, admin, PDF no cliente e checkout.
- `supabase/migrations/`: definição declarativa do banco, RLS, triggers de proteção e funções pgvector.
- `supabase/functions/gemini-proxy/`: proxy autenticado para extração de currículo, geração e embeddings.
- `supabase/functions/telegram-webhook/`: comandos, callbacks, PDF e entrevista pelo bot.
- `worker/`: busca, cache, deduplicação, matching, notificação e reprocessamento.
- `.github/workflows/worker.yml`: único agendamento encontrado; a cada duas horas, com concorrência de um job.

## Limites conhecidos do mapa

- Não há infraestrutura AWS, observabilidade dedicada, storage Supabase nem configuração Vercel além do rewrite no código.
- A configuração efetivamente implantada (secrets, variáveis, políticas já aplicadas e flags de deploy) não é verificável somente pelo repositório.

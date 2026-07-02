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

### Fase 1 — Fundação multi-tenant
- Supabase Auth (login/cadastro)
- Schema com `user_id` em todas as tabelas + RLS real
- Tela de onboarding: cadastro de currículo-base (formulário estruturado, não upload livre — mais fácil de validar e gerar CV depois) + cargos-alvo + regiões + link do Telegram

### Fase 2 — Pipeline multi-usuário
- Worker que itera por usuário ativo (fila simples: tabela `usuarios` + cron que processa em lote, ou migrar pra plataforma com jobs de verdade — Supabase Edge Functions + `pg_cron`, ou Railway/Render com worker dedicado)
- Reaproveita lógica de busca/score/geração de currículo/notificação já validada no projeto pessoal

### Fase 3 — Painel web
- Dashboard: vagas encontradas, histórico, status de candidatura, editar currículo-base e preferências
- React + Vite (stack que você já usa nos outros projetos)

### Fase 4 — Billing / limites
- Definir: grátis com limite (ex: 1 busca/dia, N vagas/mês) + plano pago sem limite, ou só pago
- Necessário porque Gemini/Adzuna/JSearch têm tiers grátis que não escalam por usuário

## Decisão pendente

Por onde começar? Recomendo Fase 1 primeiro (schema + auth) — é a base que trava tudo depois. Sem isolamento de dados via RLS, não dá pra abrir pra ninguém com segurança.

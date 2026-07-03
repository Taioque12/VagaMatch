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
- Falta (fora do escopo da fase): deploy do frontend (Vercel) pra acesso público

### Fase 4 — Billing / limites
- Definir: grátis com limite (ex: 1 busca/dia, N vagas/mês) + plano pago sem limite, ou só pago
- Necessário porque Gemini/Adzuna/JSearch têm tiers grátis que não escalam por usuário

## Decisão pendente

Por onde começar? Recomendo Fase 1 primeiro (schema + auth) — é a base que trava tudo depois. Sem isolamento de dados via RLS, não dá pra abrir pra ninguém com segurança.

# Auditoria técnica — VagaMatch

Data: 2026-08-08. Escopo: inspeção estática e comandos seguros; nenhuma correção, deploy, migração, alteração de banco ou segredo foi realizada.

## 1. Resumo executivo

O produto possui um núcleo funcional real: SPA React, autenticação e dados multiusuário no Supabase, worker agendado, quatro fontes de vagas, Gemini, matching e Telegram. A principal prioridade é reduzir a superfície de abuso de IA e do webhook antes de ampliar a base. A implementação também mistura uma trilha ativa de Mercado Pago com Stripe legado e contém riscos de escalabilidade/custo que dependem de chamadas por vaga.

Não foram encontrados segredos hard-coded nos arquivos versionados, e `.env`/`.env.local` são ignorados pelo Git. Os valores dos secrets implantados não foram lidos nem podem ser atestados pelo código.

## 2. Arquitetura atual

Ver [ARCHITECTURE.md](ARCHITECTURE.md). Stack: Vite 5 + React 18; Node.js ESM no worker; Supabase Auth/Postgres/Edge Functions/pgvector; Vercel SPA; GitHub Actions; Gemini; Telegram; Adzuna, JSearch/RapidAPI, Reed e Jooble; Mercado Pago e Stripe. Não há AWS, storage de arquivo ou observabilidade dedicada evidentes no código.

## 3. Fluxo real do produto

| Etapa | Estado | Evidência |
|---|---|---|
| Landing, cadastro e login | IMPLEMENTADO | `src/pages/Landing.jsx`, `Cadastro.jsx`, `Login.jsx` |
| Upload/análise de PDF | PARCIAL | lê PDF no browser e envia base64 ao Gemini; não armazena o PDF original |
| Perfil e preferências | IMPLEMENTADO | `Onboarding.jsx` grava `profiles`, `curriculos`, `preferencias` |
| Embedding de currículo | IMPLEMENTADO, best-effort | proxy Gemini + pgvector; falha não bloqueia onboarding |
| Busca de vagas | IMPLEMENTADO | worker usa quatro provedores e cache em `app_state` |
| Matching/notificação | IMPLEMENTADO | filtro por palavra/modalidade/salário, IA e Telegram |
| Matching vetorial/feedback | PARCIAL | depende de flags no `app_state`; default é dry-run/desligado |
| Currículo ajustado e PDF | IMPLEMENTADO, best-effort | geração Gemini e envio no Telegram |
| Candidatura | PARCIAL | registra candidato/descartada e abre link; não há candidatura integrada |
| Entrevista Telegram | IMPLEMENTADO | estado em `entrevistas` e handler no webhook |
| Billing Stripe | LEGADO / não integrado à UI atual | UI usa `mp-checkout`; funções Stripe continuam no repositório |
| Pricing na landing | PLACEHOLDER | bloco está incondicionalmente desativado por `{false && (...)}` |

## 4. Segurança e dados pessoais

Currículo, perfil, preferências, Telegram ID, histórico de vagas e embeddings devem ser tratados como dados pessoais. As migrations habilitam RLS nas tabelas principais e limitam leitura ao dono; triggers tentam impedir elevação de privilégio em colunas de plano, status e embeddings.

### Achados

| Prioridade | Ação | Achado |
|---|---|---|
| P0 | CORRIGIR AGORA | O webhook Telegram só valida `X-Telegram-Bot-Api-Secret-Token` se a variável existir. Ausente ou mal configurada, aceita updates forjados em endpoint sem JWT e opera com `service_role` (`supabase/functions/telegram-webhook/index.ts:647-670`). Fail-closed e validação de configuração são necessários. |
| P1 | ANTES DE MAIS USUÁRIOS | Upload aceita somente o `accept` do browser e lê qualquer arquivo escolhido; não valida assinatura PDF, MIME real ou tamanho antes de converter para base64 (`src/pages/Onboarding.jsx:111-149`). O limite posterior do proxy é 20 MB, alto para o fluxo e contornável pelo header ausente. |
| P1 | ANTES DE MAIS USUÁRIOS | Rate limit do `gemini-proxy` é um `Map` em memória por instância (`.../gemini-proxy/index.ts:16-31`). Não é distribuído/persistente e não impõe quota por dia, portanto não protege custos em escala nem contra múltiplas instâncias. |
| P1 | ANTES DE MONETIZAR | Webhooks de Mercado Pago/Stripe não estão declarados no `supabase/config.toml`; só Telegram tem `verify_jwt = false`. A configuração real de deploy precisa ser verificada: se JWT estiver ativo por padrão, provedores externos não conseguem chamar os webhooks; se estiver desativado sem assinatura, a exposição é crítica. |
| P2 | PODE ESPERAR | Logs do worker, callbacks e webhooks incluem IDs de usuário/chat, erros de IA e dados de vagas. Não há política de retenção/redação evidenciada. |
| P2 | PODE ESPERAR | O proxy devolve trecho de erro do Gemini ao cliente; pode expor detalhes internos do provedor. |

## 5. Custos e guardrails sem nova infraestrutura

Fontes de custo: Vercel bandwidth/build; Supabase banco, Edge Functions e egress; Gemini (extração, embedding, matching e PDF); APIs de vagas/RapidAPI; GitHub Actions; Telegram bandwidth. O worker usa cache de 90 min, lock em `app_state`, concorrência GitHub e intervalo Gemini de 4 s — controles positivos já existentes.

Riscos: até quatro buscas externas por combinação cargo/região; uma chamada Gemini por vaga, mais uma por PDF automático; cache persiste arrays de vagas no banco; lock de leitura/escrita não é atômico; `Promise.allSettled` pode manter lotes demorados; usuários pagantes não têm quota; rate limit do proxy não é global.

Guardrails recomendados, sem serviço novo: hard-limit de tamanho/tipo de upload no cliente e proxy; quota diária persistida no banco existente; limite de vagas/usuário/rodada; PDF automático desligado por padrão até medir conversão; limite para cargos/regiões/palavras-chave; idempotency key/lock atômico no Supabase; métricas agregadas em `app_state`/logs sem PII.

## 6. Matching

O fluxo efetivo é: dedup por `(user_id, job_id)`; filtro textual (>=1 palavra-chave no título/descrição); filtros fail-open para modalidade e salário sem dado; score heurístico de palavras/salário; Gemini atribui score 0–100 e motivo; score <40 é descartado. Embeddings Gemini 768D e similaridade cosseno pgvector existem, mas o pré-filtro é desligado por default e, sem vetor/erro, falha aberto. Com flag ligada, combina vetor/técnico/fit com pesos de `app_state` e feedback vetorial.

Fragilidades: filtro textual permite substring e um único termo; thresholds/pesos não possuem calibração, avaliação offline ou testes de qualidade; a explicação depende de IA; a deduplicação é por ID do provedor, não por URL/título entre fontes; `score` mistura heurística e IA; callbacks estão vinculados à vaga, mas o webhook não verifica explicitamente que o `chatId` do callback corresponde ao dono antes de alterar status (deve ser validado/corrigido em próxima rodada).

## 7. Landing e UX

Pontos positivos: proposta e CTA claros, fluxo concentrado em Telegram, `lang=pt-BR`, título/meta description/OG básicos e code-splitting por rota. Problemas priorizados: preço/planos invisíveis pelo bloco `{false}`; a promessa de automação pode soar mais madura que os controles de falha; não há evidência de analytics, página de privacidade/consentimento, sitemap/robots/canonical/OG image ou auditoria de contraste/teclado; o onboarding depende de PDF e de IA sem pré-validação de arquivo ou recuperação clara para indisponibilidade.

## 8. Banco, integrações e ambientes

Migrations definem `profiles`, `curriculos`, `preferencias`, `vagas_vistas`, `app_state`, `indicacoes`, `entrevistas`, retries, billing e vetores. RLS e triggers são definidos em migrations, mas o estado aplicado em produção não foi consultado. Segredos esperados incluem Supabase service role, Gemini, Telegram, Adzuna, RapidAPI, Reed, Jooble, Mercado Pago e Stripe. Não existe `.env` versionado; existe `.env.example` e há `.env`/`.env.local` locais ignorados.

CI/CD: GitHub Actions agenda worker a cada 2h, com `concurrency: worker`, timeout de 12 min e Node 22. Vercel tem apenas rewrite SPA. Não há pipeline de testes/build ou deploy de Edge Functions evidenciado.

## 9. Qualidade técnica e testes

Executados: `npm.cmd test` — 4 arquivos / 22 testes aprovados; `npm.cmd run build` — aprovado. `npm.cmd audit --omit=dev --audit-level=high` reportou 10 vulnerabilidades, sendo 2 altas (`fast-uri`, `ip-address`) e 8 moderadas, incluindo `react-router-dom`, `dompurify`, `hono` e transitivas. Não foi feito upgrade.

Lacunas: sem script lint/typecheck; testes cobrem partes do worker e Gemini proxy, não RLS, funções de pagamento, webhook Telegram, upload, autorização de callback, e2e ou falhas de provedores; comentários dizem cron de 10 minutos, mas workflow atual é de 2 horas (`worker/index.js:32-35`), documentação operacional está desalinhada.

## 10. Priorização e próximos passos

1. P0: tornar segredo do webhook Telegram obrigatório e falhar no deploy/boot quando ausente; validar dono da vaga contra chat/usuário no callback.
2. P1: validar magic bytes, MIME e tamanho do PDF; impor quotas persistentes de Gemini e limites de lote.
3. P1: confirmar configuração implantada de `verify_jwt`/assinaturas de todos os webhooks e RLS aplicado, sem expor secrets.
4. P1: adicionar testes de autorização/RLS, webhook e upload; corrigir dependências vulneráveis de forma deliberada.
5. P2: decidir e remover/consolidar a trilha Stripe versus Mercado Pago; expor pricing real antes de monetização.
6. P2: definir retenção, minimização de logs e política de privacidade para dados de currículo.

### Riscos 10 → 100 usuários

Quota Gemini e APIs de vagas, cache `app_state` crescendo, lock não atômico, custo de PDF automático, cobertura do worker em lotes de 50 e observabilidade insuficiente.

### Riscos para monetização

Configuração ambígua de webhooks de pagamento, duas integrações concorrentes, plano/pricing escondido, e ausência de testes de eventos/idempotência de cobrança.

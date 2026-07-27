# Walkthrough — Auditoria Bot Telegram (execução dos 4 itens)

Ref: `implementation_plan.md`. Todos os 4 itens executados e deployados em produção.

## O que mudou

### 1. Código morto removido
- Apagado `worker/feedback.js` (polling `getUpdates` desativado desde que o webhook Supabase assumiu o feedback).
- Removida a chamada comentada `// await processarFeedback()` e o try/catch vazio em `worker/index.js`.
- Removidas de `worker/telegram.js`: `enviarMenu`, `enviarMenuRegiao`, `buscarAtualizacoes` — só eram usadas pelo `feedback.js` morto.
- Apagado `worker/test-feedback.js` — script manual órfão que importava o arquivo deletado (achado durante a limpeza, não estava no plano original).

### 2. Duplicação
- Coberto pelo item 1 — a duplicação `index.ts` vs `worker/telegram.js` desapareceu junto com o código morto.

### 3. UX — botão "Voltar"
- `menu:voltar` novo callback em `supabase/functions/telegram-webhook/index.ts`, adicionado nos submenus de região e modalidade.

### 4. Filtro de salário mínimo
- **Migration** `supabase/migrations/021_salario_minimo.sql`: coluna `preferencias.salario_minimo numeric`, nullable (sem filtro = comportamento atual).
- **`worker/filter.js`**: nova função `filtrarPorSalarioMinimo` — fail-open igual ao filtro de modalidade (vaga sem salário informado passa).
- **`worker/index.js`**: filtro encadeado após modalidade, antes do score.
- **`worker/db.js`**: `salario_minimo` incluído no SELECT de preferências.
- **Telegram**: botão "💰 Salário mínimo" no menu principal, submenu com faixas (R$2k/4k/6k/10k/sem filtro), comando `/salario`, e `/status` agora mostra o valor configurado.

## Deploy em produção

| Ação | Resultado |
|---|---|
| `npx supabase db push` | Migration `021_salario_minimo` aplicada em `wrdxvhhmyptizlpdeaue` |
| `npx supabase functions deploy telegram-webhook` | Versão 14 no ar (`dashboard_url` confirmado) |

## Como foi testado

1. **Suite automatizada:** `npx vitest run` → 4 arquivos, 22 testes, todos verdes (nenhum teste tocava os arquivos removidos, então nada quebrou por remoção).
2. **Sintaxe:** `node --check` em `worker/index.js`, `worker/telegram.js`, `worker/filter.js`, `worker/db.js` — todos OK. TS do webhook (Deno) checado manualmente: contagem de chaves `{`/`}` balanceada (203/203) e leitura completa do trecho editado.
3. **Query real contra prod:** rodei `listarUsuariosAtivos()` do worker direto contra o Supabase de produção — antes da migration falhou com `column preferencias.salario_minimo does not exist` (confirma que a migration realmente era necessária); depois do `db push`, rodou limpo e retornou os 7 usuários beta.
4. **Webhook pós-deploy:** `curl POST` vazio no endpoint `telegram-webhook` → `401 Unauthorized` (esperado — `TELEGRAM_WEBHOOK_SECRET` rejeitando corretamente, função não crashou, subiu sem erro 500/502).
5. **`npx supabase functions list`** confirma `telegram-webhook` `status: ACTIVE`, `version: 14` (versão anterior a este deploy era 13).

## Não quebrou nada

- Nenhuma função ativa (`gemini-proxy`, `stripe-checkout`, `stripe-webhook`, `mp-checkout`, `mp-webhook`) foi tocada.
- Filtros novos são fail-open / nullable — usuário existente sem `salario_minimo` configurado continua vendo todas as vagas, comportamento idêntico ao anterior.
- Menu principal, comandos `/status`, `/modalidade`, `/regiao` continuam funcionando — só ganharam campos extras, nenhum campo removido.

## Pendências / observações

- MCP Supabase conectado nesta sessão só enxerga outro projeto (`gestao-projetos-dev`) — deploy real foi feito via Supabase CLI local (já linkado ao projeto certo, `wrdxvhhmyptizlpdeaue`), não pelo MCP. Ver memória "Armadilhas operacionais".
- Não dá pra rodar Deno localmente (não instalado) — checagem do `index.ts` foi sintática/manual, não um typecheck real do Deno. Recomendo observar logs da function nas próximas horas caso apareça erro de runtime não pego pela checagem estática.

---

# Rodada 2 — Limpeza geral do projeto (itens 1-4 da auditoria ampla)

Auditoria de varredura completa (worker + webhook + frontend + migrations) encontrou 8 categorias de achados. Executados os 4 primeiros (baixo risco, alto/médio impacto); os demais (PDF triplicado, `index.ts` de 635 linhas, `Onboarding.jsx`/`Dashboard.jsx` grandes) ficaram só como observação — mudança arquitetural, não pontual.

## O que mudou

### 1. `.gitignore` corrigido
- Linha 6 estava em UTF-16 corrompido (`s u p a b a s e / . t e m p /` com espaço entre cada caractere) — não funcionava como regra. Reescrevi o arquivo inteiro em UTF-8 normal.
- Resultado: `supabase/.temp/*` (9 arquivos gerados pela Supabase CLI a cada `link`/comando) estava sendo versionado à toa. `git rm --cached` removeu do tracking; a regra agora funciona de verdade.

### 2. `"html - novo/"` apagado
- Mockup estático morto (`VagaMatch Dashboard.html` 288KB + `_unpacked.html` 26KB), não referenciado por `src/` nem build. Removido do git e do disco (314KB a menos no repo).

### 3. Helper `isGeminiRateLimit(error)` criado
- Novo arquivo `worker/gemini-utils.js` — extrai o bloco de detecção de 429 (`error.status === 429 || .includes("429") || .includes("RESOURCE_EXHAUSTED")`) que estava copiado idêntico em 3 lugares.
- Refatorados `worker/ai_filter.js`, `worker/swarm.js`, `worker/curriculo.js` para importar e usar o helper. Comportamento idêntico, ~15 linhas duplicadas a menos.

### 4. Scripts de debug movidos pra `scripts/debug/`
- 13 scripts (não 12 — achei mais um durante a execução: `worker/test-webhook.js`, que o agente de auditoria não tinha listado) movidos da raiz e de `worker/` pra `scripts/debug/`: `test-models.js`, `test-pdf.js`, `update-admin.js`, `test-botinfo.js`, `test-check-ids.js`, `test-clear.js`, `test-jsearch-api.js`, `test-profile.js`, `test-status.js`, `test-updates.js`, `test-webhook-call.js`, `test-webhook-info.js`, `test-webhook.js`.
- Todos usavam import relativo (`./config.js`, `./db.js`, `./telegram.js`, `./worker/config.js`) — corrigidos para `../../worker/*.js` após o move (`sed` nos 10 que precisavam, os outros 3 não tinham import relativo próprio).
- Raiz do projeto e `worker/` agora só têm testes automatizados de verdade (`*.test.js`, rodados pelo vitest) — scripts manuais de debug ficam isolados e claramente identificados.

## Como foi validado

1. `node --check` em todos os 13 scripts movidos + nos 4 arquivos refatorados (`ai_filter.js`, `swarm.js`, `curriculo.js`, `gemini-utils.js`) — todos OK.
2. `node -e "import(...)"` — carreguei `ai_filter.js`, `swarm.js`, `curriculo.js` de verdade em runtime (não só parse) pra confirmar que o import do `gemini-utils.js` resolve sem erro.
3. `npx vitest run` — 4 arquivos, 22 testes, todos verdes. Mesma suite de antes, sem regressão.
4. `git status` final revisado a mão — pegou 2 arquivos de lixo 0-byte que minha própria shell gerou por escaping (`console.log('curriculo`), removidos antes de qualquer commit.

## Não quebrou nada

- `worker/test-status.js` (agora em `scripts/debug/`) importava `enviarMensagemSimples` de `worker/telegram.js` — função confirmada como ainda existente (não fazia parte da limpeza da Rodada 1), import corrigido e funcional.
- Nenhum arquivo movido era importado por código de produção (`worker/index.js`, `processamento.js`, etc.) — só scripts standalone chamados manualmente por linha de comando.
- `.env` carregado por `dotenv/config` depende do `process.cwd()` (diretório de onde o `node` é chamado), não do caminho do arquivo — mover os scripts não afeta o carregamento de env vars desde que continuem sendo rodados a partir da raiz do repo.

## Pendências desta rodada

- Mudanças ainda **não commitadas nem deployadas** — só staged localmente. PDF do currículo e Edge Function não têm nada tocado nesta rodada (itens 1-4 eram só limpeza local: gitignore, arquivo morto, refactor de helper, reorganização de scripts).

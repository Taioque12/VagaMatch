# Auditoria Bot Telegram — VagaMatch

Escopo: `supabase/functions/telegram-webhook/index.ts` + `interview.ts` (webhook ativo, produção), `worker/telegram.js` + `worker/feedback.js` (worker Node).

## 1. Código morto / dívida técnica

- **`worker/feedback.js` inteiro é código morto.** `processarFeedback()` só é chamado em `worker/index.js:235`, comentado (`// await processarFeedback()`). Polling `getUpdates` foi substituído pelo webhook Supabase há tempo.
- **`worker/telegram.js`: `enviarMenu`, `enviarMenuRegiao`, `buscarAtualizacoes`** só são usadas por `feedback.js` — também mortas. Versões desatualizadas (sem botão modalidade) da lógica que já vive em `index.ts`.
- Risco: dev futuro edita `worker/telegram.js` pensando que afeta o bot — não afeta nada, é webhook quem responde.
- **Proposta:** apagar `worker/feedback.js` e as 3 funções órfãs de `worker/telegram.js`. Manter só `notificarVaga`, `enviarDocumento`, `enviarResumoDiario`, `alertarErro` (usadas pelo worker de notificação, que é o papel real do worker).

## 2. Duplicação de lógica entre index.ts e interview.ts/telegram.js

- `enviarMenu`, `enviarMenuRegiao`, `LABEL_MODALIDADE`, `chamarApi` existem quase idênticos em `index.ts` (produção) e `worker/telegram.js` (morto). Sem risco real hoje pós-limpeza do item 1, mas vale nota: se algum dia o worker voltar a falar com Telegram, extrair pra módulo compartilhado.

## 3. Performance / boas práticas em index.ts

- `tratarCallback` e `tratarMensagem`: cadeia de `if` sequenciais crescendo — ok pro tamanho atual (580 linhas), não precisa de roteador agora. Não mexer (YAGNI).
- `gerarCurriculoOnDemand` + `iniciarEntrevista`/`processarMensagemEntrevista` fazem `Promise.all` corretamente pros 2-3 selects — já otimizado.
- `console.error` sem correlação de request — aceitável em Edge Function (logs Supabase já têm request_id).
- Nenhum N+1 real encontrado. Nenhuma query desnecessária.

## 4. UX/UI Telegram — estado atual

Menu principal (`/menu`, `/start`): Buscar agora, Configurar região, Modalidade, Atualizar perfil (link site).
Comandos texto: `/start`, `/menu`, `/buscar`, `/status`, `/regiao`, `/modalidade`, `/atualizar`.

**Faltando, baixo custo de implementar:**
- Botão **"⬅️ Voltar ao menu"** nos submenus (região, modalidade) — hoje usuário preso, precisa digitar `/menu` de novo.
- **`/ajuda`** ou botão "❓ Ajuda" listando comandos — só existe se usuário souber que existem.
- Menu principal não mostra **status atual** (ex: modalidade selecionada) — usuário só descobre via `/status` separado. Poderia anexar resumo curto no texto do `/menu`.

## 5. Expansão de filtros de busca

Filtros hoje: cargos-alvo, palavras-chave, região (raio/Brasil), modalidade (remoto/híbrido/presencial).

**Candidatos a novo filtro, avaliados:**
- **Faixa salarial mínima** — dado já existe em `vagas_vistas` (`salario_min`/`salario_max`, usado em `legendaVaga`). Filtro de busca ainda não existe. Valor alto: usuários citam isso.
- **Nível de senioridade** (júnior/pleno/sênior) — dado não vem estruturado do Adzuna hoje; exigiria parse por IA no swarm. Custo maior.
- **Tipo de contrato (CLT/PJ)** — mesmo problema: não vem estruturado da fonte.

**Recomendação:** implementar só **faixa salarial mínima** agora (dado já disponível, baixo esforço: 1 coluna em `preferencias`, 1 filtro em `worker/filter.js`, 1 menu Telegram). Senioridade/contrato ficam para quando houver fonte de dado estruturada — não vale forçar parse IA extra sem necessidade validada.

## Plano de execução (ordem)

1. Apagar `worker/feedback.js`; remover import em `worker/index.js:22` e `worker/index.js:235` (linha comentada).
2. Remover `enviarMenu`, `enviarMenuRegiao`, `buscarAtualizacoes` de `worker/telegram.js` (não usadas por mais ninguém).
3. Adicionar botão "⬅️ Voltar" em `enviarMenuRegiao`/`enviarMenuModalidade` no `index.ts` (callback `menu:voltar` → `enviarMenu`).
4. Adicionar filtro salário mínimo: migration em `preferencias.salario_minimo`, menu Telegram, `worker/filter.js`.

Itens 1–3: baixo risco, sem mudança de schema. Item 4: precisa migration + deploy Edge Function + teste.

**Aguardando confirmação antes de executar.**

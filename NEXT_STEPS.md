# VagaMatch — Próximos Passos (Escala do Worker)

Contexto: hoje aguenta confortável ~20-30 usuários ativos no padrão de volume atual (dezenas de vagas novas por pessoa por rodada de 10min). Passando disso, gargalo é quota do Gemini — vagas somem sem aviso (fallback `score_ia: 0`), sem travar o sistema, só degradando silencioso.

Arquivos-chave: `worker/index.js`, `worker/ai_filter.js`, `worker/db.js`, `.github/workflows/worker.yml`.

## 1. Lock de execução ✅ (concluído)

**Problema**: cron roda a cada 10min sem trava. Se uma rodada demorar mais que isso, a próxima dispara em cima, duas instâncias mexem no mesmo cursor `worker_last_user_id` ao mesmo tempo — corrida de dados.

**Fazer**:
- Usar a tabela `app_state` (já existe) pra marcar `worker_running = true` no início do `main()` e `false` no fim (bloco `finally`).
- No início do `main()`, se já tiver `worker_running = true` há mais de X minutos (ex: 15min, timeout de segurança pra caso de crash sem limpar o lock), abortar a rodada com log e sair sem erro.
- Se for crash catastrófico (`process.exit(1)` no catch do `main()`), garantir que o lock também é liberado — colocar a liberação num `finally` que sempre roda, inclusive em erro.

**Teste**: rodar duas instâncias do worker manualmente ao mesmo tempo (`npm run worker:test` em dois terminais) e confirmar que a segunda aborta sem mexer no cursor.

## 2. Cache de busca entre rodadas ✅ (concluído)

**Problema**: `cacheBusca` em `worker/index.js:215` é um `Map()` recriado a cada `main()` — só vive dentro da rodada. Toda rodada de 10min rebusca do zero pra cada combinação cargo+região, mesmo sem nada ter mudado. Adzuna free tier é limitado (~250-1000/dia).

**Fazer**:
- Nova tabela `cache_busca_vagas` (ou reaproveitar `app_state` como KV se for pouco volume): chave `cargo|regiao|raio`, coluna `resultado jsonb`, `atualizado_em timestamptz`.
- Em `buscarComCache` (`worker/index.js:55`), antes de chamar as 4 APIs (Adzuna/JSearch/Reed/Jooble), checar se existe entrada com `atualizado_em` dentro do TTL (sugestão: 90min — cadência de cron é 10min, TTL maior que isso já corta a maioria das chamadas repetidas sem deixar vaga muito velha).
- Se dentro do TTL, usar direto. Se não, buscar de verdade e fazer upsert na tabela.

**Teste**: rodar o worker 2x seguidas (`npm run worker:test`) e confirmar no log/rede que a segunda rodada não bate nas APIs externas pros mesmos cargo+região.

## 3. Paralelismo com limite de concorrência ✅ (concluído)

**Problema**: loop 100% sequencial em `rodarPipelineDoUsuario` (`worker/index.js:128`) — vaga por vaga, `await` puro. Rodadas grandes demoram demais, aumentando o risco do item 1.

**Fazer**:
- Adicionar `p-limit` (ou implementação manual de semáforo) como dependência.
- Paralelizar o loop de vagas por usuário com concorrência 3-5 simultâneas (não mais que isso — Gemini free tier é 15 RPM, e cada vaga aprovada faz 2 chamadas: score + geração de currículo).
- Cuidado: `vagasAprovadas.push(vaga)` e `processadas++`/`falhas++` não são mais seguros em paralelo puro — usar `Promise.allSettled` com acumulação depois, não mutação de variável compartilhada dentro do map.

**Teste**: comparar tempo de execução de uma rodada com volume real (ex: usuário com 30+ vagas novas) antes/depois.

## 4. Alertar em vez de descartar silencioso ✅ (concluído)

**Problema**: `avaliarMatchComIA` (`worker/ai_filter.js`) cai no catch e retorna `score_ia: 0` em qualquer erro — incluindo rate limit 429 do Gemini. Vaga é descartada como se fosse mau match, usuário nunca sabe que perdeu por causa de quota.

**Fazer**:
- Em `worker/ai_filter.js`, distinguir erro de quota/rate-limit (checar `error.status === 429` ou mensagem) de erro de conteúdo/parse.
- Em caso de 429: **não** marcar como descartada — marcar como `pendente_processamento` de novo (já existe esse status) pra reprocessar na próxima rodada, em vez de jogar fora.
- Opcional: mandar alerta pro `ADMIN_TELEGRAM_CHAT_ID` (já existe a função `alertarErro` em `worker/telegram.js`) se a taxa de 429 numa rodada passar de um threshold (ex: >20% das vagas), sinal de que a quota diária andou estourando.

**Teste**: forçar erro 429 manualmente (mock ou key inválida temporária) e confirmar que a vaga fica `pendente_processamento` em vez de `descartada`.

## 5. Reduzir de 2 chamadas Gemini pra 1 por vaga ✅ (concluído)

**Problema**: cada vaga aprovada gera 2 chamadas — score (`ai_filter.js`) e currículo ajustado (`curriculo.js`). É o maior consumidor de quota.

**Opções, escolher uma**:
- **A. Fundir num prompt só**: pedir score + currículo ajustado na mesma chamada, condicionando geração de currículo só se score >= 40 no mesmo response (mais arriscado, resposta mais longa e complexa de validar).
- **B. Adiar geração de currículo**: só gerar o currículo ajustado quando o usuário reagir "candidatado" no Telegram (callback `st:cand:...` em `supabase/functions/telegram-webhook/index.ts`), não no momento da notificação. Cai o volume de chamadas de currículo pra só quem realmente vai usar — a maioria das vagas notificadas provavelmente nunca vira candidatura.

Recomendo B: menos arriscado, e já tem a infra do webhook pronta pra disparar a geração sob demanda.

## Ordem sugerida

1. Lock de execução (baixo risco, resolve corrida de dados — fazer já)
2. Alertar em vez de descartar silencioso (baixo risco, visibilidade imediata do problema real)
3. Cache de busca entre rodadas (maior ganho de quota de API externa)
4. Paralelismo com limite (ganho de velocidade, mas exige mais cuidado)
5. Reduzir chamadas Gemini pra 1/vaga — só se o volume de usuários continuar crescendo além do que 1-4 resolverem

## Fora de escopo aqui (mencionar se perguntarem)

- Migrar de GitHub Actions cron pra outra coisa: não é necessário agora, repo é público (minutos ilimitados).
- Trocar de tier gratuito pra pago no Gemini/Adzuna: decisão de custo, não técnica — avaliar quando o volume justificar.

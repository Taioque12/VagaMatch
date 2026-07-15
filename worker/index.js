import { env, requireEnv } from "./config.js";
import { buscarVagas } from "./adzuna.js";
import { buscarVagasJSearch } from "./jsearch.js";
import { buscarVagasReed } from "./reed.js";
import { buscarVagasJooble } from "./jooble.js";
import { filtrarRelevantes, ordenarPorScore } from "./filter.js";
import {
  listarUsuariosAtivos,
  deduplicarParaUsuario,
  marcarStatus,
  salvarMessageId,
  limparBuscaSolicitada,
  getState,
  getStateWithTimestamp,
  setState,
  atualizarScoreIA,
  limparCacheVencido,
  registrarFalhaVaga,
  registrarBuscaRealizada,
  salvarEmbeddingsVagas,
  similaridadeVagaCurriculo,
  lerConfigV3,
} from "./db.js";
import { gerarEmbeddingsVagas } from "./embeddings.js";
import { avaliarMatchComIA } from "./ai_filter.js";
import { avaliarMatchSwarm, calcularScoreFinal } from "./swarm.js";
import { notificarVaga, enviarResumoDiario, alertarErro } from "./telegram.js";
import { processarFeedback } from "./feedback.js";

// Uso: node worker/index.js [--limit N]  (limita vagas processadas POR USUÁRIO, útil p/ teste)
const limitArg = process.argv.indexOf("--limit");
const limitValue = limitArg > -1 ? Number(process.argv[limitArg + 1]) : NaN;
const LIMITE = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : Infinity;
if (limitArg > -1 && !Number.isFinite(limitValue)) {
  console.warn(`⚠️  --limit inválido ou faltando valor. Usando Infinity (sem limite).`);
}

const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID; // opcional — alerta de falha fatal

// ─── Passo 4: Semáforo de concorrência (sem dependência externa) ────────────
// Limita quantas promessas rodam ao mesmo tempo. Evita estourar o rate limit
// do Gemini (15 RPM free tier) — 1 chamada de score por vaga nova.
function criarSemaforo(max) {
  let atual = 0;
  const fila = [];
  return {
    async adquirir() {
      if (atual < max) { atual++; return; }
      await new Promise((resolve) => fila.push(resolve));
      atual++;
    },
    liberar() {
      atual--;
      if (fila.length) fila.shift()();
    },
  };
}

// TTL do cache de buscas: 90 minutos (em ms).
// Cadência do cron é 10min — TTL maior que isso já corta a maioria das
// chamadas repetidas sem deixar vaga muito velha.
const CACHE_TTL_MS = 90 * 60 * 1000;

// Chave única por combinação de busca (cargo + região + raio) — usada pra cachear
// resultado entre usuários diferentes que buscam a mesma coisa, evitando 1 request por pessoa.
function chaveBusca(cargo, regiao, raioKm) {
  // encodeURIComponent evita colisão se cargo/região contiver o delimitador "|"
  return [cargo.toLowerCase(), (regiao || "").toLowerCase(), String(raioKm ?? "")]
    .map(encodeURIComponent)
    .join("|");
}

// ─── Passo 3: Cache de buscas persistido no app_state ───────────────────────
// Antes de bater nas APIs externas, verifica se existe resultado recente
// (< CACHE_TTL_MS) no app_state. Se sim, usa direto sem request.
async function buscarComCache(cacheMemoria, cargo, regiao, raioKm) {
  const chave = chaveBusca(cargo, regiao, raioKm);

  // Cache em memória (dentro da mesma rodada) — mantido pra evitar até a query ao Supabase
  if (cacheMemoria.has(chave)) return cacheMemoria.get(chave);

  // Cache persistido entre rodadas (app_state)
  const stateKey = `cache_busca:${chave}`;
  try {
    const cached = await getStateWithTimestamp(stateKey);
    if (cached?.value && cached.updated_at) {
      const idadeMs = Date.now() - new Date(cached.updated_at).getTime();
      if (idadeMs < CACHE_TTL_MS) {
        const resultado = JSON.parse(cached.value);
        cacheMemoria.set(chave, resultado);
        console.log(`  📦 Cache hit (${(idadeMs / 60000).toFixed(0)}min) para: ${cargo} / ${regiao || "sem região"}`);
        return resultado;
      }
    }
  } catch (e) {
    // Falha no cache não deve impedir a busca real
    console.warn(`Cache read falhou para ${chave}: ${e.message}`);
  }

  const vagas = new Map();
  try {
    const vagasAdzuna = await buscarVagas({ termo: cargo, regiao, raioKm });
    for (const v of vagasAdzuna) vagas.set(v.job_id, v);
  } catch (e) {
    console.error(`Busca Adzuna falhou (${cargo} / ${regiao} / ${raioKm}km): ${e.message}`);
  }
  try {
    const vagasJSearch = await buscarVagasJSearch({ termo: cargo, regiao });
    for (const v of vagasJSearch) vagas.set(v.job_id, v);
  } catch (e) {
    console.error(`Busca JSearch falhou (${cargo} / ${regiao}): ${e.message}`);
  }
  try {
    const vagasReed = await buscarVagasReed({ termo: cargo, regiao });
    for (const v of vagasReed) vagas.set(v.job_id, v);
  } catch (e) {
    console.error(`Busca Reed falhou (${cargo} / ${regiao}): ${e.message}`);
  }
  try {
    const vagasJooble = await buscarVagasJooble({ termo: cargo, regiao });
    for (const v of vagasJooble) vagas.set(v.job_id, v);
  } catch (e) {
    console.error(`Busca Jooble falhou (${cargo} / ${regiao}): ${e.message}`);
  }

  const resultado = [...vagas.values()];
  cacheMemoria.set(chave, resultado);

  // Persiste no app_state para rodadas futuras
  try {
    await setState(stateKey, JSON.stringify(resultado));
  } catch (e) {
    console.warn(`Cache write falhou para ${chave}: ${e.message}`);
  }

  return resultado;
}

// ─── Passo 2 + 4: Pipeline paralelo com tratamento de rate limit ────────────
async function rodarPipelineDoUsuario({ pref, perfil, curriculo }, cacheBusca, configV3) {
  const cargosAlvo = pref.cargos_alvo ?? [];
  const palavrasChave = pref.palavras_chave ?? [];
  const brasilTodo = pref.modo_regiao === "brasil";
  const regioes = brasilTodo ? [""] : pref.regioes?.length ? pref.regioes : [""];
  // Define o raio como 500km se não estiver preenchido
  const raioKm = brasilTodo ? null : (pref.raio_km || 500);

  if (!cargosAlvo.length || !palavrasChave.length) {
    console.log(`Usuário ${perfil.id}: sem cargos-alvo ou palavras-chave configuradas, pulando.`);
    return { processadas: 0, falhas: 0 };
  }

  const acumulado = new Map();
  for (const cargo of cargosAlvo) {
    for (const regiao of regioes) {
      const vagas = await buscarComCache(cacheBusca, cargo, regiao, raioKm);
      for (const v of vagas) acumulado.set(v.job_id, v);
    }
  }

  const relevantes = filtrarRelevantes([...acumulado.values()], palavrasChave);
  const pontuadas = ordenarPorScore(relevantes);
  const novas = await deduplicarParaUsuario(perfil.id, pontuadas);

  console.log(
    `Usuário ${perfil.id}: ${acumulado.size} brutas, ${pontuadas.length} relevantes, ${novas.length} novas.`
  );

  if (!novas.length) return { processadas: 0, falhas: 0 };

  // ─── Fase A (V3): embeddings em batch das vagas novas ───────────────────
  // Best-effort: falha aqui não bloqueia o pipeline — vaga sem embedding
  // simplesmente não participa do pré-filtro vetorial (fail-open).
  try {
    const pares = await gerarEmbeddingsVagas(novas);
    if (pares.length) {
      const salvos = await salvarEmbeddingsVagas(pares);
      console.log(`  🧠 Embeddings: ${salvos}/${novas.length} vagas vetorizadas.`);
    }
  } catch (e) {
    console.warn(`Embeddings de vagas falharam (seguindo sem vetor): ${e.message}`);
  }

  // ─── Passo 4: Processamento paralelo com semáforo (concorrência 3) ──────
  const sem = criarSemaforo(3);
  const vagasParaProcessar = novas.slice(0, LIMITE);

  const resultados = await Promise.allSettled(
    vagasParaProcessar.map(async (vaga) => {
      await sem.adquirir();
      try {
        // ─── Camada 0 (V3): pré-filtro vetorial ANTES de gastar chamada Gemini ──
        // Similaridade coseno currículo×vaga via pgvector (RPC). null = sem
        // embedding de um dos lados ou erro → sem sinal, segue fluxo normal.
        const scoreVetor = await similaridadeVagaCurriculo(perfil.id, vaga.id);
        if (scoreVetor !== null && scoreVetor < configV3.threshold) {
          if (configV3.prefiltroAtivo) {
            // Flag ON: descarta de verdade, economizando a chamada Gemini.
            console.log(
              `  ✂️ [V3] Vaga ${vaga.job_id} descartada pelo pré-filtro (score_vetor=${scoreVetor.toFixed(2)} < ${configV3.threshold}).`
            );
            await atualizarScoreIA(
              vaga.id,
              Math.round(scoreVetor * 100),
              `Pré-filtro vetorial: similaridade ${scoreVetor.toFixed(2)} abaixo do limiar ${configV3.threshold}.`
            );
            await marcarStatus(vaga.id, "descartada");
            return { tipo: "descartada", vaga };
          }
          // Flag OFF: dry-run — só loga o que ACONTECERIA, fluxo antigo intacto.
          console.log(
            `  🧪 [V3 DRY-RUN] Vaga ${vaga.job_id} seria descartada pois score_vetor=${scoreVetor.toFixed(2)} < ${configV3.threshold}.`
          );
        }

        // 1. Avalia o Match Real com IA (respeitando 15 RPM do Gemini)
        // ─── Camada 1 (V3, Opção A — isolamento total) ───────────────────
        // Flag OFF: prompt antigo (ai_filter.js), comportamento idêntico ao
        // de produção hoje. Flag ON: swarm Técnico+Fit (1 chamada) + média
        // ponderada com o score vetorial usando os pesos do app_state.
        await aguardarJanelaGemini();
        let score_ia, motivo_ia;
        if (configV3.prefiltroAtivo) {
          const r = await avaliarMatchSwarm(vaga, curriculo, palavrasChave, pref);
          score_ia = calcularScoreFinal(scoreVetor, r.score_tecnico, r.score_fit, configV3.pesos);
          motivo_ia = `⚙️ Técnico (${r.score_tecnico}): ${r.motivo_tecnico} 🤝 Fit (${r.score_fit}): ${r.motivo_fit}`;
        } else {
          ({ score_ia, motivo_ia } = await avaliarMatchComIA(vaga, curriculo, palavrasChave));
        }
        vaga.score = score_ia;
        vaga.motivo_ia = motivo_ia;
        await atualizarScoreIA(vaga.id, score_ia, motivo_ia);

        // Pula vagas que a IA considerou ruins (ex: score < 40)
        if (score_ia < 40) {
          console.log(`Vaga ${vaga.job_id} ignorada pela IA (Score: ${score_ia})`);
          await marcarStatus(vaga.id, "descartada");
          return { tipo: "descartada", vaga };
        }

        // Marca como descoberta só após IA aprovar (antes de Telegram)
        await marcarStatus(vaga.id, "descoberta");

        // Notificação simples, sem CV/PDF — a geração agora é on-demand no webhook
        // do Telegram, só quando o usuário clica "📄 Gerar PDF" (corta custo Gemini).
        const messageId = await notificarVaga(perfil.telegram_chat_id, vaga);
        await salvarMessageId(vaga.id, messageId);
        await marcarStatus(vaga.id, "notificada");
        return { tipo: "ok", vaga };
      } finally {
        sem.liberar();
      }
    })
  );

  // ─── Contabiliza resultados ─────────────────────────────────────────────
  let processadas = 0;
  let falhas = 0;
  let rateLimitCount = 0;
  const vagasAprovadas = [];

  for (const [i, r] of resultados.entries()) {
    if (r.status === "fulfilled") {
      if (r.value.tipo === "ok") {
        processadas++;
        vagasAprovadas.push(r.value.vaga);
      }
      // "descartada" não conta como processada nem falha
    } else {
      // rejected — erro
      const erro = r.reason;
      const vaga = vagasParaProcessar[i];
      if (erro?.isRateLimit) {
        // ─── Passo 2: Não descartar por rate limit — manter como pendente ──
        // 429 não incrementa tentativas: é quota nossa, não defeito da vaga.
        rateLimitCount++;
        console.warn(`⚠️ Vaga mantida como pendente (429): ${erro.message}`);
      } else {
        console.error(`Falha em vaga ${vaga?.job_id} (usuário ${perfil.id}): ${erro?.message}`);
        falhas++;
        // Max retries: após 3 falhas não-429 a vaga vira 'erro' (status terminal,
        // dedup para de reprocessar) — evita retry infinito de falha persistente.
        if (vaga?.id) {
          await registrarFalhaVaga(vaga.id, 3)
            .then((n) => {
              if (n >= 3) console.warn(`🛑 Vaga ${vaga.job_id} marcada 'erro' após ${n} tentativas.`);
            })
            .catch((e) => console.error(`Falha ao registrar tentativa (${vaga.job_id}): ${e.message}`));
        }
      }
    }
  }

  // ─── Passo 2: Alerta ao admin se taxa de 429 > 20% ─────────────────────
  if (rateLimitCount > 0 && vagasParaProcessar.length > 0) {
    const taxa429 = rateLimitCount / vagasParaProcessar.length;
    if (taxa429 > 0.2) {
      console.warn(`🚨 ${(taxa429 * 100).toFixed(0)}% das vagas deram rate limit (429)!`);
      await alertarErro(
        ADMIN_CHAT_ID,
        `Rate limit alto: ${rateLimitCount}/${vagasParaProcessar.length} vagas (${(taxa429 * 100).toFixed(0)}%) ` +
        `deram 429 na rodada do usuário ${perfil.id}. Possível estouro de quota do Gemini.`
      ).catch(() => {});
    }
  }

  // Envia resumo após filtro IA (só vagas aprovadas)
  if (vagasAprovadas.length > 1) {
    await enviarResumoDiario(perfil.telegram_chat_id, vagasAprovadas).catch((e) =>
      console.error(`Falha no resumo (${perfil.id}): ${e.message}`)
    );
  }

  return { processadas, falhas };
}

// ─── Passo 1: Lock de execução ──────────────────────────────────────────────
const LOCK_TIMEOUT_MIN = 15; // Timeout de segurança — crash sem limpar lock

// Só libera o lock no catch fatal se ESTA instância o adquiriu — crash antes
// da aquisição (ex: requireEnv) não pode soltar o lock de outra instância viva.
let lockAdquirido = false;

// Espaçamento mínimo entre chamadas Gemini: free tier é 15 RPM (1 req/4s).
// Concorrência 3 sozinha limita paralelismo, não taxa — sem isso uma rodada
// grande estoura a quota e vira chuva de 429.
const GEMINI_MIN_INTERVAL_MS = 4000;
let proximoSlotGemini = 0;
async function aguardarJanelaGemini() {
  // Reserva síncrona do slot (single-thread) — sem corrida entre promessas paralelas
  const agora = Date.now();
  const slot = Math.max(agora, proximoSlotGemini);
  proximoSlotGemini = slot + GEMINI_MIN_INTERVAL_MS;
  if (slot > agora) await new Promise((r) => setTimeout(r, slot - agora));
}

async function main() {
  requireEnv([
    "adzunaAppId", "adzunaAppKey",
    "supabaseUrl", "supabaseServiceKey",
    "geminiApiKey",
    "telegramBotToken",
  ]);

  // ─── Lock: impedir duas instâncias simultâneas ──────────────────────────
  const lockAtivo = await getState("worker_running");
  if (lockAtivo === "true") {
    const lockDesde = await getState("worker_running_since");
    const minutosRodando = lockDesde
      ? (Date.now() - new Date(lockDesde).getTime()) / 60000
      : Infinity;

    if (minutosRodando < LOCK_TIMEOUT_MIN) {
      console.log(
        `⏳ Worker já está rodando há ${minutosRodando.toFixed(1)}min. Abortando esta instância.`
      );
      return;
    }
    console.warn(
      `⚠️ Lock travado há ${minutosRodando.toFixed(1)}min (possível crash anterior). Assumindo controle.`
    );
  }

  await setState("worker_running", "true");
  await setState("worker_running_since", new Date().toISOString());
  lockAdquirido = true;

  try {
    // ─── GC do cache de buscas: remove chaves cache_busca:* mais velhas que 2×TTL ──
    // Best-effort: falha aqui não pode derrubar a rodada.
    try {
      const removidas = await limparCacheVencido(CACHE_TTL_MS * 2);
      if (removidas > 0) console.log(`🧹 Cache GC: ${removidas} chave(s) vencida(s) removida(s).`);
    } catch (e) {
      console.warn(`Cache GC falhou (seguindo normal): ${e.message}`);
    }

    try {
      // Polling desativado. Agora é o Webhook que cuida do feedback!
      // await processarFeedback();
    } catch (e) {
      console.error(`Falha ao processar feedback: ${e.message}`);
    }

    const TAMANHO_LOTE = 50;
    let lastUserId = await getState("worker_last_user_id");
    console.log(`Buscando usuários após: ${lastUserId || "(início)"}`);

    let usuarios = await listarUsuariosAtivos(TAMANHO_LOTE, lastUserId);

    if (usuarios.length === 0 && lastUserId) {
      // Chegou no fim da lista normal. Reseta e busca do início na MESMA rodada!
      console.log("Fim da lista de usuários. Resetando cursor para início e buscando novamente.");
      await setState("worker_last_user_id", "");
      lastUserId = "";
      usuarios = await listarUsuariosAtivos(TAMANHO_LOTE, lastUserId);
    }

    console.log(`Lote atual: ${usuarios.length} usuário(s) encontrados com Telegram vinculado.`);

    if (usuarios.length === 0) {
      console.log("Nenhum usuário ativo para processar.");
      return;
    }

    let totalProcessadas = 0;
    let totalFalhas = 0;
    // Cache por rodada: cargo+região+raio iguais entre usuários diferentes = 1 request só,
    // não 1 por pessoa. Crítico pra escalar (ver ROADMAP: 1000+ usuários estourariam o free tier da Adzuna).
    const cacheBusca = new Map();

    // ─── Camada 0 (V3): config calibrável a quente via app_state ────────────
    // Lida 1x por rodada. Falha na leitura → defaults seguros com flag OFF
    // (dry-run): produção nunca descarta vaga por problema de config.
    let configV3 = { prefiltroAtivo: false, threshold: 0.55, pesos: { vetor: 0.5, tecnico: 0.3, fit: 0.2 } };
    try {
      configV3 = await lerConfigV3();
    } catch (e) {
      console.warn(`Falha ao ler config V3 (usando defaults, prefiltro OFF): ${e.message}`);
    }
    console.log(
      `Config V3: prefiltro=${configV3.prefiltroAtivo ? "ON" : "OFF (dry-run)"}, threshold=${configV3.threshold}.`
    );

    for (const usuario of usuarios) {
      // Regra de Billing: plano free tem quota de 1 busca a cada 24 horas.
      // Free = plano null/'free' OU assinatura não ativa. Pagantes: sem limite.
      const isFree =
        !usuario.perfil.plano ||
        usuario.perfil.plano === "free" ||
        usuario.perfil.assinatura_status !== "ativa";
      if (isFree && usuario.pref.ultima_busca_em) {
        const horasDesdeUltimaBusca =
          (Date.now() - new Date(usuario.pref.ultima_busca_em).getTime()) / (1000 * 60 * 60);
        if (horasDesdeUltimaBusca < 24) {
          // Vale também pro disparo manual: a busca manual conta como a busca do dia.
          console.log(
            `⏭️ Usuário free ${usuario.perfil.id}: quota de 24h (última busca há ${horasDesdeUltimaBusca.toFixed(1)}h). Pulando.`
          );
          // Limpa o pedido manual mesmo no skip — senão o usuário ficaria
          // preso na fila prioritária logando skip a cada rodada por 24h.
          // (o bot/onboarding setam busca_solicitada, não disparo_manual)
          if (usuario.pref.busca_solicitada) {
            await limparBuscaSolicitada(usuario.pref.user_id).catch((e) =>
              console.error(`Falha ao limpar busca_solicitada (${usuario.perfil.id}): ${e.message}`)
            );
          }
          continue;
        }
      }

      try {
        const { processadas, falhas } = await rodarPipelineDoUsuario(usuario, cacheBusca, configV3);
        totalProcessadas += processadas;
        totalFalhas += falhas;
        // Só free precisa do carimbo de quota — falha aqui não derruba a rodada.
        if (isFree) {
          await registrarBuscaRealizada(usuario.pref.user_id).catch((e) =>
            console.error(`Falha ao registrar ultima_busca_em (${usuario.perfil.id}): ${e.message}`)
          );
        }
      } catch (e) {
        console.error(`Falha fatal no pipeline do usuário ${usuario.perfil.id}: ${e.message}`);
        totalFalhas++;
        await alertarErro(usuario.perfil.telegram_chat_id, `Falha ao processar suas vagas: ${e.message}`).catch(
          () => {}
        );
      } finally {
        if (usuario.pref.busca_solicitada) {
          await limparBuscaSolicitada(usuario.pref.user_id).catch((e) =>
            console.error(`Falha ao limpar busca_solicitada (${usuario.perfil.id}): ${e.message}`)
          );
        }
      }
    }

    console.log(`Lote processado. ${totalProcessadas} vaga(s) notificada(s), ${totalFalhas} falha(s) no total.`);

    // Salva o último user_id processado como cursor pra próxima rodada
    if (usuarios.length > 0) {
      // Ignora usuários de busca_solicitada para não bagunçar o cursor
      const usuariosNormais = usuarios.filter(u => !u.pref.busca_solicitada);
      
      if (usuariosNormais.length > 0) {
        // Ordena por ID pois a junção no db.js pode ter desordenado
        const idsNormais = usuariosNormais.map(u => u.pref.user_id).sort();
        const ultimoUserId = idsNormais[idsNormais.length - 1];
        await setState("worker_last_user_id", ultimoUserId);
        console.log(`Cursor avançado para user_id: ${ultimoUserId}`);
      } else {
        console.log(`Lote contendo apenas usuários prioritários. Cursor mantido em: ${lastUserId || "(início)"}`);
      }
    } else {
      // Se lista vazia, reseta cursor
      await setState("worker_last_user_id", "");
      console.log("Lista vazia, cursor resetado.");
    }
  } finally {
    // ─── Lock: sempre libera, inclusive em erro ───────────────────────────
    await setState("worker_running", "false").catch((e) =>
      console.error(`Falha ao liberar lock: ${e.message}`)
    );
  }
}

main().catch(async (e) => {
  console.error(e);
  // Garante liberação do lock mesmo em crash fatal — mas só se esta instância o pegou
  if (lockAdquirido) await setState("worker_running", "false").catch(() => {});
  await alertarErro(ADMIN_CHAT_ID, `Falha fatal no worker: ${e.message}`).catch(() => {});
  process.exit(1);
});

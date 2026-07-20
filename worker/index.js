import { env, requireEnv } from "./config.js";
import { buscarVagas } from "./adzuna.js";
import { buscarVagasJSearch } from "./jsearch.js";
import { buscarVagasReed } from "./reed.js";
import { buscarVagasJooble } from "./jooble.js";
import { filtrarRelevantes, ordenarPorScore } from "./filter.js";
import {
  listarUsuariosAtivos,
  deduplicarParaUsuario,
  limparBuscaSolicitada,
  getState,
  getStateWithTimestamp,
  setState,
  limparCacheVencido,
  registrarBuscaRealizada,
  salvarEmbeddingsVagas,
  lerConfigV3,
  buscarPendentesAntigas,
} from "./db.js";
import { gerarEmbeddingsVagas } from "./embeddings.js";
import { alertarErro } from "./telegram.js";
import { processarFeedback } from "./feedback.js";
import { processarLoteDeVagas } from "./processamento.js";

// Uso: node worker/index.js [--limit N]  (limita vagas processadas POR USUÁRIO, útil p/ teste)
const limitArg = process.argv.indexOf("--limit");
const limitValue = limitArg > -1 ? Number(process.argv[limitArg + 1]) : NaN;
const LIMITE = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : Infinity;
if (limitArg > -1 && !Number.isFinite(limitValue)) {
  console.warn(`⚠️  --limit inválido ou faltando valor. Usando Infinity (sem limite).`);
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
async function rodarPipelineDoUsuario(usuario, cacheBusca, configV3) {
  const { pref, perfil, curriculo } = usuario;
  const cargosAlvo = pref.cargos_alvo ?? [];
  const palavrasChave = pref.palavras_chave ?? [];
  const brasilTodo = pref.modo_regiao === "brasil";
  const regioes = brasilTodo ? [""] : pref.regioes?.length ? pref.regioes : [""];
  // Define o raio como 500km se não estiver preenchido
  const raioKm = brasilTodo ? null : (pref.raio_km || 500);

  // Sem cargos/palavras-chave não dá pra buscar vagas NOVAS, mas pendentes
  // antigas de quando o perfil tinha configuração (ou de bug anterior) ainda
  // merecem reprocessamento — não faz sentido deixá-las presas para sempre.
  const semConfig = !cargosAlvo.length || !palavrasChave.length;
  if (semConfig) {
    console.log(`Usuário ${perfil.id}: sem cargos-alvo ou palavras-chave configuradas — pulando busca de novas.`);
  }

  let novas = [];
  if (!semConfig) {
    const acumulado = new Map();
    for (const cargo of cargosAlvo) {
      for (const regiao of regioes) {
        const vagas = await buscarComCache(cacheBusca, cargo, regiao, raioKm);
        for (const v of vagas) acumulado.set(v.job_id, v);
      }
    }

    const relevantes = filtrarRelevantes([...acumulado.values()], palavrasChave);
    const pontuadas = ordenarPorScore(relevantes);
    novas = await deduplicarParaUsuario(perfil.id, pontuadas);

    console.log(
      `Usuário ${perfil.id}: ${acumulado.size} brutas, ${pontuadas.length} relevantes, ${novas.length} novas.`
    );
  }

  // ─── Fix estrutural: reprocessa pendentes antigas (>1h) travadas de rodadas
  // anteriores que morreram no meio (timeout do Actions) antes de avaliá-las.
  // Não reaparecem na busca bruta, então sem isso ficariam órfãs para sempre.
  let pendentesAntigas = [];
  try {
    pendentesAntigas = await buscarPendentesAntigas(perfil.id, 60 * 60 * 1000, 30);
    if (pendentesAntigas.length) {
      console.log(`  ♻️ ${pendentesAntigas.length} vaga(s) pendente(s) antiga(s) reincluída(s) para reprocessamento.`);
    }
  } catch (e) {
    console.warn(`Busca de pendentes antigas falhou (usuário ${perfil.id}): ${e.message}`);
  }

  if (!novas.length && !pendentesAntigas.length) return { processadas: 0, falhas: 0 };

  // ─── Fase A (V3): embeddings em batch das vagas novas ───────────────────
  // Best-effort: falha aqui não bloqueia o pipeline — vaga sem embedding
  // simplesmente não participa do pré-filtro vetorial (fail-open).
  if (novas.length) {
    try {
      const pares = await gerarEmbeddingsVagas(novas);
      if (pares.length) {
        const salvos = await salvarEmbeddingsVagas(pares);
        console.log(`  🧠 Embeddings: ${salvos}/${novas.length} vagas vetorizadas.`);
      }
    } catch (e) {
      console.warn(`Embeddings de vagas falharam (seguindo sem vetor): ${e.message}`);
    }
  }

  const vagasParaProcessar = [...novas, ...pendentesAntigas].slice(0, LIMITE);
  return processarLoteDeVagas({ pref, perfil, curriculo }, vagasParaProcessar, configV3);
}

// ─── Passo 1: Lock de execução ──────────────────────────────────────────────
const LOCK_TIMEOUT_MIN = 15; // Timeout de segurança — crash sem limpar lock

// Só libera o lock no catch fatal se ESTA instância o adquiriu — crash antes
// da aquisição (ex: requireEnv) não pode soltar o lock de outra instância viva.
let lockAdquirido = false;

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
  await alertarErro(env.adminTelegramChatId, `Falha fatal no worker: ${e.message}`).catch(() => {});
  process.exit(1);
});

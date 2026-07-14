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
  supabase,
  atualizarScoreIA,
} from "./db.js";
import { avaliarMatchComIA } from "./ai_filter.js";
import { notificarVaga, enviarResumoDiario, alertarErro } from "./telegram.js";
import { processarFeedback } from "./feedback.js";
import { gerarCurriculo } from "./curriculo.js";
import { gerarPdf } from "./pdf.js";
import { join } from "path";
import { tmpdir } from "os";

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
// do Gemini (15 RPM free tier) — cada vaga aprovada pode gerar 2 chamadas.
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

async function buscarEmail(userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}

// Chave única por combinação de busca (cargo + região + raio) — usada pra cachear
// resultado entre usuários diferentes que buscam a mesma coisa, evitando 1 request por pessoa.
function chaveBusca(cargo, regiao, raioKm) {
  return `${cargo.toLowerCase()}|${(regiao || "").toLowerCase()}|${raioKm ?? ""}`;
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
async function rodarPipelineDoUsuario({ pref, perfil, curriculo }, cacheBusca) {
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

  const email = await buscarEmail(perfil.id);
  const perfilCV = { nomeCompleto: perfil.nome_completo || "Candidato", localizacao: perfil.localizacao, email };

  // ─── Passo 4: Processamento paralelo com semáforo (concorrência 3) ──────
  const sem = criarSemaforo(3);
  const vagasParaProcessar = novas.slice(0, LIMITE);

  const resultados = await Promise.allSettled(
    vagasParaProcessar.map(async (vaga) => {
      await sem.adquirir();
      try {
        // 1. Avalia o Match Real com IA
        const { score_ia, motivo_ia } = await avaliarMatchComIA(vaga, curriculo, palavrasChave);
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

        // Gera o currículo adaptado para a vaga e cria o PDF
        const cvTailored = await gerarCurriculo(vaga, curriculo, perfilCV.nomeCompleto);
        const pdfPath = join(tmpdir(), `CV_${perfil.id}_${vaga.job_id}.pdf`);
        await gerarPdf(cvTailored, perfilCV, pdfPath);

        const messageId = await notificarVaga(perfil.telegram_chat_id, vaga, pdfPath);
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

  for (const r of resultados) {
    if (r.status === "fulfilled") {
      if (r.value.tipo === "ok") {
        processadas++;
        vagasAprovadas.push(r.value.vaga);
      }
      // "descartada" não conta como processada nem falha
    } else {
      // rejected — erro
      const erro = r.reason;
      if (erro?.isRateLimit) {
        // ─── Passo 2: Não descartar por rate limit — manter como pendente ──
        rateLimitCount++;
        console.warn(`⚠️ Vaga mantida como pendente (429): ${erro.message}`);
        // Status já é "pendente_processamento" do upsert, não marcamos "erro"
      } else {
        console.error(`Falha em vaga (usuário ${perfil.id}): ${erro?.message}`);
        // Tenta marcar como erro (best-effort — pode não ter vaga.id em todos os casos)
        falhas++;
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

  try {

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

    for (const usuario of usuarios) {
      try {
        const { processadas, falhas } = await rodarPipelineDoUsuario(usuario, cacheBusca);
        totalProcessadas += processadas;
        totalFalhas += falhas;
      } catch (e) {
        console.error(`Falha fatal no pipeline do usuário ${usuario.perfil.id}: ${e.message}`);
        totalFalhas++;
        await alertarErro(usuario.perfil.telegram_chat_id, `Falha ao processar suas vagas: ${e.message}`).catch(
          () => {}
        );
      } finally {
        if (usuario.pref.disparo_manual) {
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
  // Garante liberação do lock mesmo em crash fatal
  await setState("worker_running", "false").catch(() => {});
  await alertarErro(ADMIN_CHAT_ID, `Falha fatal no worker: ${e.message}`).catch(() => {});
  process.exit(1);
});

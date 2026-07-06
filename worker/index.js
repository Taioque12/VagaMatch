import { join } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { env, requireEnv } from "./config.js";
import { buscarVagas } from "./adzuna.js";
import { buscarVagasJSearch } from "./jsearch.js";
import { filtrarRelevantes, ordenarPorScore } from "./filter.js";
import {
  listarUsuariosAtivos,
  deduplicarParaUsuario,
  marcarStatus,
  salvarMessageId,
  limparBuscaSolicitada,
  getState,
  setState,
  supabase,
} from "./db.js";
import { gerarCurriculo } from "./curriculo.js";
import { gerarDocx } from "./docx.js";
import { gerarPdf } from "./pdf.js";
import { notificarVaga, enviarResumoDiario, alertarErro } from "./telegram.js";
import { processarFeedback } from "./feedback.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "output");

// Uso: node worker/index.js [--limit N]  (limita vagas processadas POR USUÁRIO, útil p/ teste)
const limitArg = process.argv.indexOf("--limit");
const LIMITE = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const nomeSeguro = (jobId) => jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID; // opcional — alerta de falha fatal

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

async function buscarComCache(cache, cargo, regiao, raioKm) {
  const chave = chaveBusca(cargo, regiao, raioKm);
  if (cache.has(chave)) return cache.get(chave);

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

  const resultado = [...vagas.values()];
  cache.set(chave, resultado);
  return resultado;
}

async function rodarPipelineDoUsuario({ pref, perfil, curriculo }, cacheBusca) {
  const cargosAlvo = pref.cargos_alvo ?? [];
  const palavrasChave = pref.palavras_chave ?? [];
  const brasilTodo = pref.modo_regiao === "brasil";
  const regioes = brasilTodo ? [""] : pref.regioes?.length ? pref.regioes : [""];
  const raioKm = brasilTodo ? null : pref.raio_km;

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

  if (novas.length > 1) {
    await enviarResumoDiario(perfil.telegram_chat_id, novas).catch((e) =>
      console.error(`Falha no resumo (${perfil.id}): ${e.message}`)
    );
  }

  const email = await buscarEmail(perfil.id);
  const perfilCV = { nomeCompleto: perfil.nome_completo || "Candidato", localizacao: perfil.localizacao, email };

  let processadas = 0;
  let falhas = 0;
  for (const vaga of novas) {
    if (processadas >= LIMITE) break;
    try {
      const cv = await gerarCurriculo(vaga, curriculo, perfilCV.nomeCompleto);
      const base = `CV_${nomeSeguro(perfil.id)}_${nomeSeguro(vaga.job_id)}`;
      const docxPath = await gerarDocx(cv, perfilCV, join(OUT_DIR, `${base}.docx`));
      const pdfPath = await gerarPdf(cv, perfilCV, join(OUT_DIR, `${base}.pdf`));
      const messageId = await notificarVaga(
        perfil.telegram_chat_id,
        vaga,
        docxPath,
        pdfPath,
        cv.palavras_chave_da_vaga_cobertas
      );
      await salvarMessageId(vaga.id, messageId);
      await marcarStatus(vaga.id, "notificada", docxPath);
      processadas++;
    } catch (e) {
      console.error(`Falha em vaga ${vaga.job_id} (usuário ${perfil.id}): ${e.message}`);
      await marcarStatus(vaga.id, "erro").catch(() => {});
      falhas++;
    }
  }

  return { processadas, falhas };
}

async function main() {
  requireEnv([
    "adzunaAppId", "adzunaAppKey",
    "supabaseUrl", "supabaseServiceKey",
    "geminiApiKey",
    "telegramBotToken",
  ]);

  mkdirSync(OUT_DIR, { recursive: true });

  try {
    await processarFeedback();
  } catch (e) {
    console.error(`Falha ao processar feedback: ${e.message}`);
  }

  const TAMANHO_LOTE = 50;
  const cursorAtual = Number(await getState("worker_user_offset")) || 0;
  console.log(`Buscando usuários a partir do offset: ${cursorAtual}`);

  const usuarios = await listarUsuariosAtivos(TAMANHO_LOTE, cursorAtual);
  console.log(`Lote atual: ${usuarios.length} usuário(s) encontrados com Telegram vinculado.`);

  if (usuarios.length === 0) {
    // Chegou no fim da lista (ou não tem ninguém). Reseta para a próxima rodada!
    console.log("Fim da lista de usuários. Resetando cursor para 0.");
    await setState("worker_user_offset", 0);
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
  
  // Avança o cursor para o próximo lote (daqui a 10 min, por exemplo)
  await setState("worker_user_offset", cursorAtual + TAMANHO_LOTE);
  console.log(`Próximo offset definido para: ${cursorAtual + TAMANHO_LOTE}`);
}

main().catch(async (e) => {
  console.error(e);
  await alertarErro(ADMIN_CHAT_ID, `Falha fatal no worker: ${e.message}`).catch(() => {});
  process.exit(1);
});

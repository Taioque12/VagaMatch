// Lógica de avaliação/notificação de um lote de vagas — extraída de index.js
// pra ser importável sem side-effect (index.js roda main() ao ser importado).
// Usada pelo pipeline normal (vagas novas + pendentes antigas) e por scripts
// ad-hoc de reprocessamento (ex: scripts/reprocessar-pendentes.mjs).
import {
  marcarStatus,
  salvarMessageId,
  atualizarScoreIA,
  registrarFalhaVaga,
  similaridadeVagaCurriculo,
  ajusteFeedbackVetorial,
} from "./db.js";
import { avaliarMatchComIA } from "./ai_filter.js";
import { avaliarMatchSwarm, calcularScoreFinal } from "./swarm.js";
import { notificarVaga, enviarResumoDiario, alertarErro } from "./telegram.js";

const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;

// ─── Passo 4: Semáforo de concorrência (sem dependência externa) ────────────
// Limita quantas promessas rodam ao mesmo tempo. Evita estourar o rate limit
// do Gemini (15 RPM free tier) — 1 chamada de score por vaga nova.
export function criarSemaforo(max) {
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

// Espaçamento mínimo entre chamadas Gemini: free tier é 15 RPM (1 req/4s).
// Concorrência 3 sozinha limita paralelismo, não taxa — sem isso uma rodada
// grande estoura a quota e vira chuva de 429.
const GEMINI_MIN_INTERVAL_MS = 4000;
let proximoSlotGemini = 0;
export async function aguardarJanelaGemini() {
  // Reserva síncrona do slot (single-thread) — sem corrida entre promessas paralelas
  const agora = Date.now();
  const slot = Math.max(agora, proximoSlotGemini);
  proximoSlotGemini = slot + GEMINI_MIN_INTERVAL_MS;
  if (slot > agora) await new Promise((r) => setTimeout(r, slot - agora));
}

// Processa um lote de vagas (já em vagas_vistas) para um usuário: Camada 0
// (pré-filtro vetorial + feedback), Camada 1 (swarm/ai_filter), notificação
// Telegram. Reaproveitado tanto pelo fluxo normal (vagas novas + pendentes
// antigas) quanto por scripts ad-hoc de reprocessamento.
export async function processarLoteDeVagas({ pref, perfil, curriculo }, vagasParaProcessar, configV3) {
  if (!vagasParaProcessar.length) return { processadas: 0, falhas: 0 };
  const palavrasChave = pref.palavras_chave ?? [];

  // ─── Passo 4: Processamento paralelo com semáforo (concorrência 3) ──────
  const sem = criarSemaforo(3);

  const resultados = await Promise.allSettled(
    vagasParaProcessar.map(async (vaga) => {
      await sem.adquirir();
      try {
        // ─── Camada 0 (V3): pré-filtro vetorial ANTES de gastar chamada Gemini ──
        // Similaridade coseno currículo×vaga via pgvector (RPC). null = sem
        // embedding de um dos lados ou erro → sem sinal, segue fluxo normal.
        let scoreVetor = await similaridadeVagaCurriculo(perfil.id, vaga.id);

        // ─── Fase C (V3): ajuste por memória de feedback ──────────────────
        // Vaga parecida com descartes recentes → penalidade; parecida com
        // candidaturas → bônus. Só com flag ON: fluxo legado nem consulta a RPC.
        if (configV3.prefiltroAtivo && scoreVetor !== null) {
          const aj = await ajusteFeedbackVetorial(perfil.id, vaga.id);
          if (aj) {
            const delta = configV3.fatorFeedback *
              ((aj.simCandidaturas ?? 0) - (aj.simDescartes ?? 0));
            if (delta !== 0) {
              const antes = scoreVetor;
              scoreVetor = Math.max(0, Math.min(1, scoreVetor + delta));
              console.log(
                `  🧠 [V3] Feedback ajustou vaga ${vaga.job_id}: ${antes.toFixed(2)} → ${scoreVetor.toFixed(2)} ` +
                `(desc=${aj.simDescartes?.toFixed(2) ?? "—"}, cand=${aj.simCandidaturas?.toFixed(2) ?? "—"}, fator=${configV3.fatorFeedback}).`
              );
            }
          }
        }

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

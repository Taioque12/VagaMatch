import { GoogleGenAI } from '@google/genai';
import { env } from './config.js';

// Camada 1 (V3): "swarm" Técnico + Fit-Cultural em 1 única chamada Gemini.
// Isolado de ai_filter.js de propósito (Opção A): enquanto v3_prefiltro=off,
// produção continua no prompt antigo — este módulo só roda com a flag ON.
// 2 agentes lógicos, 1 request: o gargalo real é o rate limit (15 RPM), não
// o paralelismo de raciocínio dentro do prompt.

let ai = null;
if (env.geminiApiKey) {
  ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
}

function clampScore(valor) {
  return Math.max(0, Math.min(100, Number(valor) || 0));
}

export async function avaliarMatchSwarm(vaga, curriculo, palavrasChave, pref = {}) {
  if (!ai) {
    console.warn("Chave do Gemini não configurada, swarm retornando scores 0.");
    return {
      score_tecnico: 0,
      score_fit: 0,
      motivo_tecnico: "API do Gemini não configurada no worker.",
      motivo_fit: "API do Gemini não configurada no worker.",
    };
  }

  const prompt = `Você é um comitê de recrutamento composto por DOIS especialistas independentes
avaliando o match entre um candidato e uma vaga. Cada um dá sua nota SEM ser influenciado pelo outro.

ESPECIALISTA 1 — RECRUTADOR TÉCNICO:
Avalia apenas competência: habilidades, experiência e senioridade do candidato vs requisitos da vaga.
Ignora localização, regime e salário.

ESPECIALISTA 2 — FIT-CULTURAL/CONTEXTO:
Avalia apenas aderência de contexto: senioridade pretendida vs oferecida, cargos-alvo do candidato,
região/regime de trabalho e alinhamento com o que o candidato declarou buscar.
Ignora se o candidato domina ou não a stack.

Retorne um JSON ESTRITO com exatamente estas chaves:
{
  "score_tecnico": <inteiro 0-100>,
  "score_fit": <inteiro 0-100>,
  "motivo_tecnico": "<1-2 frases do Especialista 1>",
  "motivo_fit": "<1-2 frases do Especialista 2>"
}

VAGA:
Título: ${vaga.titulo}
Empresa: ${vaga.empresa}
Local: ${vaga.local || "Não informado"}
Descrição: ${vaga.descricao || vaga.resumo || "Não informado"}

PERFIL DO CANDIDATO:
Palavras-chave de interesse: ${palavrasChave.join(", ")}
Cargos-alvo: ${(pref.cargos_alvo || curriculo.cargos_alvo || []).join(", ") || "Não informado"}
Modalidade de trabalho desejada: ${pref.modalidade_trabalho && pref.modalidade_trabalho !== "qualquer" ? pref.modalidade_trabalho : "sem preferência declarada"}
Resumo Profissional: ${curriculo.resumo_profissional || "Não informado"}
Habilidades: ${(curriculo.habilidades || []).join(", ")}
Experiências: ${(curriculo.experiencias || [])
    .map((e) => `${e.cargo} (${e.empresa}, ${e.periodo})`)
    .join("; ") || "Não informado"}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    let text = response.text.trim();
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const json = JSON.parse(text);

    return {
      score_tecnico: clampScore(json.score_tecnico),
      score_fit: clampScore(json.score_fit),
      motivo_tecnico: json.motivo_tecnico || "Avaliado pelo agente técnico.",
      motivo_fit: json.motivo_fit || "Avaliado pelo agente de fit.",
    };
  } catch (error) {
    // Mesma semântica de erro do ai_filter.js: 429 vira isRateLimit (vaga fica
    // pendente, sem queimar tentativa); resto rethrow (reprocessa na próxima rodada).
    const is429 = error.status === 429
      || error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED");

    if (is429) {
      console.warn(`⚠️ Rate limit (429) do Gemini no swarm: ${vaga.titulo}`);
      const err = new Error(`Gemini rate limit (429): ${error.message}`);
      err.isRateLimit = true;
      throw err;
    }

    console.error("Erro no swarm Técnico+Fit:", error.message);
    throw error;
  }
}

// ─── Fase C (V3, esboço): refino de perfil semanal ──────────────────────────
// Extrai um padrão em texto do feedback recente do usuário. AINDA NÃO tem cron:
// será chamada por um job semanal que envia o resumo ao Telegram perguntando
// "Notei isso no seu perfil, quer que eu atualize suas palavras-chave?" —
// ajuste só com confirmação do usuário (nunca automático, evita feedback-loop).
export async function resumirFeedbackSemanal(userId) {
  const { listarFeedbackRecente } = await import("./db.js");
  const { descartes, candidaturas } = await listarFeedbackRecente(userId, 7);

  if (!ai) return null;
  if (descartes.length + candidaturas.length < 5) return null; // pouco sinal, resumo seria chute

  const linha = (v) => `- ${v.titulo} | ${v.empresa} | ${v.local || "?"}`;
  const prompt = `Você é um analista de comportamento de busca de emprego.
Abaixo, as vagas que um usuário DESCARTOU e nas quais SE CANDIDATOU na última semana.
Extraia o padrão em 1-3 frases curtas e acionáveis, em português (ex: "Descarta vagas PJ
e de outra cidade; prefere backend remoto"). Se não houver padrão claro, responda "sem padrão claro".
Não invente — cite só o que os dados sustentam.

DESCARTOU (${descartes.length}):
${descartes.map(linha).join("\n") || "(nenhuma)"}

CANDIDATOU-SE (${candidaturas.length}):
${candidaturas.map(linha).join("\n") || "(nenhuma)"}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  const resumo = response.text?.trim();
  return resumo && !/sem padrão claro/i.test(resumo) ? resumo : null;
}

// Score final da V3: média ponderada com pesos do app_state.
// scoreVetor ∈ [0..1] ou null (sem embedding) — quando null, os pesos são
// renormalizados sobre técnico+fit pra não punir a vaga por falta de vetor.
export function calcularScoreFinal(scoreVetor, scoreTecnico, scoreFit, pesos) {
  const p = { vetor: 0.5, tecnico: 0.3, fit: 0.2, ...pesos };
  if (scoreVetor === null || scoreVetor === undefined) {
    const soma = p.tecnico + p.fit;
    if (soma <= 0) return Math.round((scoreTecnico + scoreFit) / 2);
    return Math.round((scoreTecnico * p.tecnico + scoreFit * p.fit) / soma);
  }
  return Math.round(scoreVetor * 100 * p.vetor + scoreTecnico * p.tecnico + scoreFit * p.fit);
}

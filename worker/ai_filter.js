import { GoogleGenAI } from '@google/genai';
import { env } from './config.js';

let ai = null;
if (env.geminiApiKey) {
  ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
}

export async function avaliarMatchComIA(vaga, curriculo, palavrasChave) {
  if (!ai) {
    console.warn("Chave do Gemini não configurada, usando fallback para AI Score = 0");
    return { score_ia: 0, motivo_ia: "API do Gemini não configurada no worker." };
  }

  const prompt = `Você é um recrutador técnico avaliando se um candidato é adequado para uma vaga.
Dê uma nota de 0 a 100 para o "match" entre a vaga e as habilidades/currículo do candidato.
Retorne um JSON ESTRITO com duas chaves:
- score (número inteiro de 0 a 100)
- motivo (string curta, 1 ou 2 frases, explicando por que essa vaga é um bom (ou mau) match)

VAGA:
Título: ${vaga.titulo}
Empresa: ${vaga.empresa}
Descrição: ${vaga.descricao || vaga.resumo || 'Não informado'}

PERFIL DO CANDIDATO:
Palavras-chave de interesse: ${palavrasChave.join(", ")}
Resumo Profissional: ${curriculo.resumo_profissional || 'Não informado'}
Habilidades: ${(curriculo.habilidades || []).join(", ")}
Cargos-alvo: ${(curriculo.cargos_alvo || []).join(", ")}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    let text = response.text.trim();
    // Remove markdown code fences: ```json...``` ou ```...```
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const json = JSON.parse(text);

    // Coerce score to number, validar range 0-100
    const scoreRaw = json.score ?? 0;
    const score_ia = Math.max(0, Math.min(100, Number(scoreRaw) || 0));

    return {
      score_ia,
      motivo_ia: json.motivo || "Avaliado pela IA."
    };
  } catch (error) {
    // Distinguir rate limit (429) de erros genéricos — vaga não deve ser descartada por falta de quota.
    const is429 = error.status === 429
      || error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED");

    if (is429) {
      console.warn(`⚠️ Rate limit (429) do Gemini ao avaliar vaga: ${vaga.titulo}`);
      const err = new Error(`Gemini rate limit (429): ${error.message}`);
      err.isRateLimit = true;
      throw err;
    }

    // Erro transitório (500, rede, JSON malformado do modelo): rethrow em vez de
    // retornar score 0 — score 0 faria o index marcar 'descartada' permanente e
    // uma vaga boa sumiria por causa de falha momentânea. Rejeitada no allSettled,
    // a vaga fica 'pendente_processamento' e é reprocessada na próxima rodada.
    console.error("Erro ao avaliar match com IA:", error.message);
    throw error;
  }
}

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

    let text = response.text;
    if (text.startsWith("\`\`\`json")) {
      text = text.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
    }
    const json = JSON.parse(text);
    return {
      score_ia: json.score || 0,
      motivo_ia: json.motivo || "Avaliado pela IA."
    };
  } catch (error) {
    console.error("Erro ao avaliar match com IA:", error.message);
    return { score_ia: 0, motivo_ia: "Falha na avaliação da IA." };
  }
}

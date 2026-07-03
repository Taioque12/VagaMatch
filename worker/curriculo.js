import { GoogleGenAI, Type } from "@google/genai";
import { env } from "./config.js";

const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    resumo_profissional: { type: Type.STRING },
    habilidades: { type: Type.ARRAY, items: { type: Type.STRING } },
    experiencias: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cargo: { type: Type.STRING },
          empresa: { type: Type.STRING },
          periodo: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["cargo", "empresa", "periodo", "bullets"],
      },
    },
    formacao: { type: Type.ARRAY, items: { type: Type.STRING } },
    cursos: { type: Type.ARRAY, items: { type: Type.STRING } },
    projetos: { type: Type.ARRAY, items: { type: Type.STRING } },
    palavras_chave_da_vaga_cobertas: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "resumo_profissional",
    "habilidades",
    "experiencias",
    "formacao",
    "cursos",
    "projetos",
    "palavras_chave_da_vaga_cobertas",
  ],
};

// Converte a linha estruturada de `curriculos` (JSON) no texto que vira contexto fixo do prompt.
function montarCurriculoBase(curriculo, nomeCompleto) {
  const linhas = [`Nome: ${nomeCompleto}`, ""];

  linhas.push("Resumo profissional:", curriculo.resumo_profissional || "(não informado)", "");

  if (curriculo.habilidades?.length) {
    linhas.push("Habilidades técnicas:", curriculo.habilidades.join(", "), "");
  }

  if (curriculo.experiencias?.length) {
    linhas.push("Experiência profissional (mais recente primeiro):");
    for (const exp of curriculo.experiencias) {
      linhas.push(`- ${exp.cargo} | ${exp.empresa} | ${exp.periodo}`);
      for (const b of exp.bullets ?? []) linhas.push(`  - ${b}`);
    }
    linhas.push("");
  }

  if (curriculo.formacao?.length) {
    linhas.push("Formação acadêmica:");
    for (const f of curriculo.formacao) linhas.push(`- ${f}`);
    linhas.push("");
  }

  if (curriculo.cursos?.length) {
    linhas.push("Cursos complementares:");
    for (const c of curriculo.cursos) linhas.push(`- ${c}`);
    linhas.push("");
  }

  if (curriculo.projetos?.length) {
    linhas.push("Projetos paralelos:");
    for (const p of curriculo.projetos) linhas.push(`- ${p}`);
  }

  return linhas.join("\n");
}

function montarSystemPrompt(curriculoBase) {
  return `Você é um especialista em currículos técnicos no Brasil.

Sua tarefa: ajustar o currículo-base abaixo para uma vaga específica.

REGRAS INEGOCIÁVEIS:
- NUNCA invente experiência, certificação, curso ou dado que não esteja no currículo-base.
- Você pode: reordenar bullets, reescrever o resumo profissional destacando o que a vaga pede, selecionar/priorizar cursos mais relevantes, incorporar palavras-chave da vaga QUANDO correspondem a experiência real.
- Mantenha datas, empresas e cargos exatamente como estão.
- Escreva em português do Brasil.

CURRÍCULO-BASE:
${curriculoBase}`;
}

export async function gerarCurriculo(vaga, curriculo, nomeCompleto) {
  const curriculoBase = montarCurriculoBase(curriculo, nomeCompleto);
  const prompt = `Ajuste o currículo para esta vaga:\n\nTítulo: ${vaga.titulo}\nEmpresa: ${vaga.empresa}\nLocal: ${vaga.local}\n\nDescrição:\n${vaga.descricao}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: montarSystemPrompt(curriculoBase),
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Resposta vazia da API Gemini.");
  return JSON.parse(text);
}

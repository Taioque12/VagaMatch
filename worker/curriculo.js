import { GoogleGenAI, Type } from "@google/genai";
import { jsPDF } from "jspdf";
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
- "resumo_profissional" é a frase de apresentação do candidato: EXATAMENTE 5 linhas, tom direto,
  resumindo quem é, principais competências e o que busca — alinhado à vaga, sem inventar nada.

CURRÍCULO-BASE:
${curriculoBase}`;
}

export async function gerarCurriculo(vaga, curriculo, nomeCompleto) {
  const curriculoBase = montarCurriculoBase(curriculo, nomeCompleto);
  const prompt = `Ajuste o currículo para esta vaga:\n\nTítulo: ${vaga.titulo}\nEmpresa: ${vaga.empresa}\nLocal: ${vaga.local || "Não informado"}\n\nDescrição:\n${vaga.descricao || vaga.resumo || "Não informado"}`;

  try {
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
  } catch (error) {
    // Mesma semântica de 429 do ai_filter/swarm — chamador decide o que fazer
    // (no PDF automático é best-effort: vaga já notificada, só o anexo falha).
    const is429 = error.status === 429
      || error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED");
    if (is429) {
      const err = new Error(`Gemini rate limit (429): ${error.message}`);
      err.isRateLimit = true;
      throw err;
    }
    throw error;
  }
}

// ─── PDF do currículo — espelho ATS-safe de src/lib/curriculoPdf.js ─────────
// (e do gerarPdfBytes do webhook). Mudança de layout deve ser replicada lá.
const MARGEM = 50;
const LARGURA_UTIL_PT = 595.28 - MARGEM * 2; // A4 em pt

function novaPagina(doc, y) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  if (y > alturaPagina - MARGEM) { doc.addPage(); return MARGEM; }
  return y;
}

function secao(doc, y, titulo) {
  y += 10;
  y = novaPagina(doc, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(26, 26, 26);
  doc.text(titulo, MARGEM, y);
  y += 4;
  doc.setDrawColor(204, 204, 204);
  doc.line(MARGEM, y, MARGEM + LARGURA_UTIL_PT, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  return y;
}

function paragrafo(doc, y, texto) {
  const linhas = doc.splitTextToSize(texto || "", LARGURA_UTIL_PT);
  linhas.forEach((linha) => {
    y = novaPagina(doc, y);
    doc.text(linha, MARGEM, y);
    y += 13;
  });
  return y;
}

function bullet(doc, y, texto) {
  const linhas = doc.splitTextToSize(`•  ${texto}`, LARGURA_UTIL_PT - 10);
  linhas.forEach((linha, i) => {
    y = novaPagina(doc, y);
    doc.text(linha, MARGEM + (i === 0 ? 0 : 10), y);
    y += 13;
  });
  return y;
}

export function gerarPdfCurriculo(cv, nomeCompleto, localizacao) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Metadata ATS-friendly — espelha os outros dois geradores.
  doc.setProperties({
    title: `Currículo — ${nomeCompleto}`,
    subject: "Currículo",
    author: nomeCompleto,
    creator: "VagaMatch",
  });

  let y = MARGEM;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text(nomeCompleto, MARGEM + LARGURA_UTIL_PT / 2, y, { align: "center" });
  y += 20;

  if (localizacao) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(85, 85, 85);
    doc.text(localizacao, MARGEM + LARGURA_UTIL_PT / 2, y, { align: "center" });
    y += 16;
  }
  doc.setTextColor(26, 26, 26);

  if (cv.resumo_profissional) {
    y = secao(doc, y, "Resumo Profissional");
    y = paragrafo(doc, y, cv.resumo_profissional);
  }

  if (cv.habilidades?.length) {
    y = secao(doc, y, "Habilidades Técnicas");
    y = paragrafo(doc, y, cv.habilidades.join(" · "));
  }

  if (cv.experiencias?.length) {
    y = secao(doc, y, "Experiência Profissional");
    for (const exp of cv.experiencias) {
      if (!exp || typeof exp !== "object") continue;
      y = novaPagina(doc, y);
      doc.setFont("helvetica", "bold");
      doc.text(`${exp.cargo || ""} | ${exp.empresa || ""} | ${exp.periodo || ""}`, MARGEM, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      for (const b of exp.bullets ?? []) {
        if (b && String(b).trim()) y = bullet(doc, y, String(b));
      }
      y += 4;
    }
  }

  if (cv.formacao?.length) {
    y = secao(doc, y, "Formação Acadêmica");
    for (const f of cv.formacao) y = bullet(doc, y, String(f));
  }

  if (cv.cursos?.length) {
    y = secao(doc, y, "Cursos Complementares");
    for (const c of cv.cursos) y = bullet(doc, y, String(c));
  }

  if (cv.projetos?.length) {
    y = secao(doc, y, "Projetos");
    for (const pr of cv.projetos) y = bullet(doc, y, String(pr));
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

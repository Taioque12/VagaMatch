// Edge Function que centraliza as chamadas ao Gemini feitas pelo frontend.
// Motivo: a chave da API nunca deve ficar no bundle do cliente (VITE_* é público).
// Aqui ela vive só como secret do projeto (`supabase secrets set GEMINI_API_KEY=...`).
import { GoogleGenAI, Type } from "npm:@google/genai@^0.15.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACAO_SCHEMA = {
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
  },
  required: ["resumo_profissional", "habilidades", "experiencias", "formacao", "cursos", "projetos"],
};

function montarPromptDocumento(tipo, vaga, perfil) {
  const contextoVaga = `VAGA:
Título: ${vaga.titulo}
Empresa: ${vaga.empresa}
Descrição/Resumo: ${vaga.descricao || vaga.resumo || "Não informado"}

PERFIL DO CANDIDATO:
Nome: ${perfil.nome || "Candidato"}
Área de Atuação: ${perfil.area_atuacao || "Não informado"}
Resumo: ${perfil.resumo || "Não informado"}
Experiência: ${perfil.experiencia || "Não informado"}
Educação/Habilidades: ${perfil.skills || "Não informado"}`;

  if (tipo === "cv") {
    return `Você é um especialista em recrutamento.
Crie um currículo sob medida, em Markdown puro (sem blocos de código usando crases), para a vaga abaixo usando os dados do perfil do candidato. Seja profissional e destaque os pontos do candidato que mais se alinham à vaga.

${contextoVaga}

Retorne apenas o texto do currículo formatado, sem introduções ou explicações.`;
  }

  return `Você é um especialista em recrutamento e comunicação.
Crie uma carta de apresentação envolvente e profissional, em Markdown puro (sem blocos de código usando crases), para a vaga abaixo usando os dados do perfil do candidato. Mostre entusiasmo e alinhamento com a empresa e a vaga.

${contextoVaga}

Retorne apenas o texto da carta de apresentação formatada, sem introduções ou explicações.`;
}

async function gerarDocumento(ai, tipo, vaga, perfil) {
  const prompt = montarPromptDocumento(tipo, vaga, perfil);
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  return response.text;
}

async function extrairCurriculo(ai, base64Data, mimeType) {
  const prompt = `Você é um extrator de dados de currículos. Extraia todas as informações deste documento e retorne ESTRITAMENTE em formato JSON.
As chaves do JSON devem ser exatamente estas:
- resumo_profissional (string)
- habilidades (array de strings)
- experiencias (array de objetos contendo: cargo (string), empresa (string), periodo (string), bullets (array de strings))
- formacao (array de strings)
- cursos (array de strings)
- projetos (array de strings)

Não retorne nada além do JSON puro, sem blocos de código markdown.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ inlineData: { data: base64Data, mimeType } }, prompt],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACAO_SCHEMA,
    },
  });

  return JSON.parse(response.text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const responder = (body) =>
    new Response(JSON.stringify(body), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada no ambiente da function.");

    // O Supabase já valida o JWT antes de invocar a function (verify_jwt=true por
    // padrão); aqui confirmamos que existe mesmo um usuário autenticado por trás do token.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autenticado.");

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) throw new Error("Sessão inválida.");

    const body = await req.json();
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    if (body.action === "gerarDocumento") {
      const texto = await gerarDocumento(ai, body.tipo, body.vaga, body.perfil);
      return responder({ data: texto });
    }

    if (body.action === "extrairCurriculo") {
      const dados = await extrairCurriculo(ai, body.base64Data, body.mimeType);
      return responder({ data: dados });
    }

    throw new Error("Ação desconhecida.");
  } catch (error) {
    return responder({ error: error.message });
  }
});

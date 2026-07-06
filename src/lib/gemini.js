import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

let ai = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export async function gerarDocumentoIA(tipo, vaga, perfil) {
  if (!ai) {
    throw new Error("Chave de API do Gemini não configurada no ambiente.");
  }

  const promptCV = `Você é um especialista em recrutamento. 
Crie um currículo sob medida, em Markdown puro (sem blocos de código usando crases), para a vaga abaixo usando os dados do perfil do candidato. Seja profissional e destaque os pontos do candidato que mais se alinham à vaga.

VAGA:
Título: ${vaga.titulo}
Empresa: ${vaga.empresa}
Descrição/Resumo: ${vaga.descricao || vaga.resumo || 'Não informado'}

PERFIL DO CANDIDATO:
Nome: ${perfil.nome || 'Candidato'}
Área de Atuação: ${perfil.area_atuacao || 'Não informado'}
Resumo: ${perfil.resumo || 'Não informado'}
Experiência: ${perfil.experiencia || 'Não informado'}
Educação/Habilidades: ${perfil.skills || 'Não informado'}

Retorne apenas o texto do currículo formatado, sem introduções ou explicações.`;

  const promptCarta = `Você é um especialista em recrutamento e comunicação. 
Crie uma carta de apresentação envolvente e profissional, em Markdown puro (sem blocos de código usando crases), para a vaga abaixo usando os dados do perfil do candidato. Mostre entusiasmo e alinhamento com a empresa e a vaga.

VAGA:
Título: ${vaga.titulo}
Empresa: ${vaga.empresa}
Descrição/Resumo: ${vaga.descricao || vaga.resumo || 'Não informado'}

PERFIL DO CANDIDATO:
Nome: ${perfil.nome || 'Candidato'}
Área de Atuação: ${perfil.area_atuacao || 'Não informado'}
Resumo: ${perfil.resumo || 'Não informado'}
Experiência: ${perfil.experiencia || 'Não informado'}
Educação/Habilidades: ${perfil.skills || 'Não informado'}

Retorne apenas o texto da carta de apresentação formatada, sem introduções ou explicações.`;

  const prompt = tipo === 'cv' ? promptCV : promptCarta;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });
    return response.text;
  } catch (error) {
    console.error("Erro ao gerar conteúdo:", error);
    throw new Error("Falha ao gerar o documento com IA.");
  }
}

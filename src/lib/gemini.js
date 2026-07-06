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

export async function extrairDadosCurriculo(base64Data, mimeType = "application/pdf") {
  if (!ai) throw new Error("Chave de API do Gemini não configurada.");

  const prompt = `Você é um extrator de dados de currículos. Extraia todas as informações deste documento e retorne ESTRITAMENTE em formato JSON.
As chaves do JSON devem ser exatamente estas:
- resumo_profissional (string)
- habilidades (array de strings)
- experiencias (array de objetos contendo: cargo (string), empresa (string), periodo (string), bullets (array de strings))
- formacao (array de strings)
- cursos (array de strings)
- projetos (array de strings)

Não retorne nada além do JSON puro, sem blocos de código markdown (\`\`\`).`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        prompt
      ],
      config: {
        responseMimeType: "application/json"
      }
    });
    
    let text = response.text;
    // Tenta remover crases de markdown se o modelo ignorar a instrução
    if (text.startsWith("\`\`\`json")) {
        text = text.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
    }
    return JSON.parse(text);
  } catch (error) {
    console.error("Erro ao extrair dados do currículo:", error);
    throw new Error("Falha ao ler o PDF com IA. Tente preencher manualmente.");
  }
}

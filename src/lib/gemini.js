import { supabase } from './supabase.js';

// Chama a Edge Function 'gemini-proxy', que guarda a API key do Gemini no servidor
// e valida o JWT do usuário antes de gastar cota. Nunca falar com a API do Gemini
// direto do frontend — a key não pode ir pro bundle.
async function chamarGemini({ contents, config }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Você precisa estar logado.");

  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: { contents, config },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw new Error(error.message || "Falha ao chamar o serviço de IA.");
  if (data?.error) throw new Error(data.error);
  return data.text;
}

export async function gerarDocumentoIA(tipo, vaga, perfil) {
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
    return await chamarGemini({ contents: prompt });
  } catch (error) {
    console.error("Erro ao gerar conteúdo:", error.message);
    throw new Error("Falha ao gerar o documento com IA.");
  }
}

export async function extrairDadosCurriculo(base64Data, mimeType = "application/pdf") {
  const prompt = `Você é um extrator de dados de currículos. Extraia todas as informações deste documento e retorne ESTRITAMENTE em formato JSON.
As chaves do JSON devem ser exatamente estas:
- nome_completo (string)
- localizacao (string, formato "Cidade, UF")
- resumo_profissional (string)
- habilidades (array de strings)
- experiencias (array de objetos contendo: cargo (string), empresa (string), periodo (string), bullets (array de strings))
- formacao (array de strings)
- cursos (array de strings)
- projetos (array de strings)
- cargos_alvo (array de strings — 2 a 4 cargos que este candidato deveria buscar em vagas, com base no histórico dele)
- palavras_chave (array de strings — termos técnicos/skills mais relevantes para buscar vagas alinhadas)
- regioes (array de strings — a cidade/região extraída de localizacao, ex: ["São Paulo, SP"])

Não retorne nada além do JSON puro, sem blocos de código markdown (\`\`\`).`;

  try {
    const text = await chamarGemini({
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        prompt,
      ],
      config: { responseMimeType: "application/json" },
    });

    let cleaned = text;
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n/, "").replace(/\n```$/, "");
    }
    try {
      return JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON parse erro:", parseError.message, "Resposta:", cleaned.slice(0, 200));
      throw new Error("Falha ao processar resposta da IA (JSON inválido).");
    }
  } catch (error) {
    console.error("Erro ao extrair dados do currículo:", error.message);
    throw new Error("Falha ao ler o PDF com IA. Tente preencher manualmente.");
  }
}

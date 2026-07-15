import { supabase } from './supabase.js';

const GEMINI_TIMEOUT_MS = 30000; // 30 seg timeout

async function chamarGemini({ contents, config }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Você precisa estar logado.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body: { contents, config },
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (error) {
      // Abort do timeout chega como FunctionsFetchError retornado (invoke não
      // rejeita com AbortError) — detecta pelo próprio signal.
      if (controller.signal.aborted) {
        throw new Error("Requisição expirou (Gemini demorou muito). Tente de novo.");
      }
      // FunctionsHttpError traz só "Edge Function returned a non-2xx status code";
      // o motivo real fica no Response em error.context. Proxy usa { error };
      // erros do gateway do Supabase usam { message } / { msg }.
      let detalhe = null;
      try {
        const corpo = await error.context?.json();
        detalhe = corpo?.error || corpo?.message || corpo?.msg;
      } catch { /* corpo não-JSON ou já consumido — usa a mensagem genérica */ }
      throw new Error(detalhe || error.message || "Falha ao chamar o serviço de IA.");
    }
    if (data?.error) throw new Error(data.error);
    if (!data?.text) throw new Error("IA retornou resposta vazia. Tente novamente.");
    return data.text;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error("Requisição expirou (Gemini demorou muito). Tente de novo.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
    // Propaga o motivo real (429, safety, 5xx) em vez de mascarar com genérico.
    throw error;
  }
}

function validarSchemaCurriculo(dados) {
  const campos_obrigatorios = ['nome_completo', 'habilidades'];
  for (const campo of campos_obrigatorios) {
    if (!dados[campo]) {
      throw new Error(`Campo obrigatório "${campo}" ausente ou vazio.`);
    }
  }
  if (!Array.isArray(dados.habilidades) || dados.habilidades.length === 0) {
    throw new Error("Campo 'habilidades' deve ser um array não-vazio.");
  }
  if (typeof dados.nome_completo !== 'string' || dados.nome_completo.trim().length === 0) {
    throw new Error("Campo 'nome_completo' deve ser uma string não-vazia.");
  }
  return dados;
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

    let cleaned = text.trim();
    // Remove markdown code fences: ```json...``` ou ```...```
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    try {
      const dados = JSON.parse(cleaned);
      validarSchemaCurriculo(dados);
      return dados;
    } catch (parseError) {
      console.error("JSON parse/schema erro:", parseError.message, "Resposta:", cleaned.slice(0, 200));
      throw new Error("Falha ao processar resposta da IA (JSON inválido ou campos ausentes).");
    }
  } catch (error) {
    console.error("Erro ao extrair dados do currículo:", error.message);
    // Propaga o erro real sem re-prefixar — o UI (Onboarding) já adiciona o
    // contexto "Erro ao processar o PDF:"; mascarar aqui esconderia 401/413/429.
    throw error;
  }
}

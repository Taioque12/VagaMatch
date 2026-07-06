import { supabase } from "./supabase.js";

// Toda chamada ao Gemini passa pela Edge Function `gemini` — a chave da API
// fica só no ambiente da function (secret), nunca no bundle público do cliente.
async function invocarGemini(payload) {
  const { data, error } = await supabase.functions.invoke("gemini", { body: payload });
  if (error) throw new Error(error.message || "Falha ao chamar o serviço de IA.");
  if (data?.error) throw new Error(data.error);
  return data.data;
}

export async function gerarDocumentoIA(tipo, vaga, perfil) {
  try {
    return await invocarGemini({ action: "gerarDocumento", tipo, vaga, perfil });
  } catch (error) {
    console.error("Erro ao gerar conteúdo:", error);
    throw new Error("Falha ao gerar o documento com IA.");
  }
}

export async function extrairDadosCurriculo(base64Data, mimeType = "application/pdf") {
  try {
    return await invocarGemini({ action: "extrairCurriculo", base64Data, mimeType });
  } catch (error) {
    console.error("Erro ao extrair dados do currículo:", error);
    throw new Error("Falha ao ler o PDF com IA. Tente preencher manualmente.");
  }
}

// Parsing de textarea/input em array — usado no onboarding pra converter os campos
// de texto livre (uma opção por linha, ou separadas por vírgula) nos arrays salvos no banco.
export const linhas = (texto) =>
  texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export const csv = (texto) =>
  texto
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

// Base64 tem ~33% de overhead sobre o binário; um PDF de 4MB vira ~5.3MB de payload JSON pra
// Edge Function do Gemini. Limite conservador pra não estourar o limite de corpo da function
// nem travar o navegador convertendo um PDF gigante pra base64 na hora do upload.
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

export function validarTamanhoPdf(tamanhoBytes, maxBytes = MAX_PDF_BYTES) {
  if (tamanhoBytes > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`Arquivo muito grande (máximo ${maxMb}MB). Tente compactar o PDF ou preencha manualmente.`);
  }
}

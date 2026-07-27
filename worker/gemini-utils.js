// Detecta rate limit (429) do Gemini a partir de um erro de fetch/SDK.
export function isGeminiRateLimit(error) {
  return error.status === 429
    || error.message?.includes("429")
    || error.message?.includes("RESOURCE_EXHAUSTED");
}

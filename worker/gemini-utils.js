// Detecta rate limit (429) do Gemini a partir de um erro de fetch/SDK.
export function isGeminiRateLimit(error) {
  return error.status === 429
    || error.message?.includes("429")
    || error.message?.includes("RESOURCE_EXHAUSTED");
}

export function isGeminiDailyQuota(error) {
  return error.message?.includes("RequestsPerDay")
    || error.message?.includes("PerDayPerProject")
    || error.message?.includes("RequestsPerDayPerProject");
}

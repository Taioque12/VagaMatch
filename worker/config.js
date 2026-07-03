import "dotenv/config";

export const env = {
  adzunaAppId: process.env.ADZUNA_APP_ID,
  adzunaAppKey: process.env.ADZUNA_APP_KEY,
  rapidapiKey: process.env.RAPIDAPI_KEY, // opcional
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
};

export function requireEnv(keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Variáveis de ambiente faltando: ${missing.join(", ")}`);
  }
}

// Referência de mercado usada no scoring (reconfirmar periodicamente).
export const MEDIANA_SALARIAL = 4850;

// Leitura centralizada das variáveis do front, com validação em runtime:
// build sobe, mas o app falha alto e cedo se a config estiver incompleta.
const obrigatorias = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  telegramBotUsername: import.meta.env.VITE_TELEGRAM_BOT_USERNAME,
};

const faltando = Object.entries(obrigatorias)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (faltando.length) {
  throw new Error(`Variáveis de ambiente do front faltando: ${faltando.join(", ")} (.env)`);
}

export const ENV = Object.freeze(obrigatorias);

import { supabase } from "./db.js";
import { env } from "./config.js";

async function run() {
  // 1. Buscar todos os perfis com telegram vinculado
  const { data: perfis, error } = await supabase
    .from("profiles")
    .select("id, nome_completo, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  if (error) { console.error(error); return; }
  
  console.log("=== Perfis com Telegram vinculado ===");
  for (const p of perfis) {
    console.log(`  ${p.nome_completo} -> Chat ID: "${p.telegram_chat_id}"`);
  }

  // 2. Testar envio direto para o ID 1115905489 (Alan)
  console.log("\n=== Testando envio para 1115905489 ===");
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: 1115905489,
      text: "✅ Teste de conexão do VagaMatch! Se você está lendo isso, deu certo!",
    }),
  });
  const data = await res.json();
  console.log("Resultado:", JSON.stringify(data, null, 2));
}

run();

import { env } from "../../worker/config.js";

async function run() {
  const webhookUrl = "https://wrdxvhhmyptizlpdeaue.supabase.co/functions/v1/telegram-webhook";
  if (!env.telegramBotToken || !env.telegramWebhookSecret) {
    throw new Error("TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET são obrigatórios para registrar o webhook.");
  }
  console.log("Setting webhook to:", webhookUrl);
  
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: env.telegramWebhookSecret }),
  });
  const data = await res.json();
  console.log("Response:", data);
}

run();

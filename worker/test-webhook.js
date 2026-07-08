import { env } from "./config.js";

async function run() {
  const webhookUrl = "https://wrdxvhhmyptizlpdeaue.supabase.co/functions/v1/telegram-webhook";
  console.log("Setting webhook to:", webhookUrl);
  
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await res.json();
  console.log("Response:", data);
}

run();

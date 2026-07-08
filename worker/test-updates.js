import { env } from "./config.js";

async function run() {
  const API = (metodo) => `https://api.telegram.org/bot${env.telegramBotToken}/${metodo}`;
  const res = await fetch(API("getUpdates"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeout: 0, allowed_updates: ["callback_query", "message"] }),
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();

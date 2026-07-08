import { env } from "./config.js";

async function run() {
  const res = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/getMe`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();

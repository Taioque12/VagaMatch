import { env } from "./worker/config.js";

async function run() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.geminiApiKey}`);
  const data = await res.json();
  console.log(data.models.map(m => m.name).filter(n => n.includes("embed")));
}

run();

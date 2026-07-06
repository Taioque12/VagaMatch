// Webhook do Telegram (Vercel Serverless Function).
// Único lugar do sistema, além do worker, autorizado a usar a service_role key —
// ela vive apenas nas env vars do projeto Vercel, nunca no bundle do front.
import { tratarUpdate } from "../../worker/updates.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  // O Telegram reenvia o secret configurado no setWebhook neste header.
  // Sem match exato, a request não veio do Telegram: descarta sem processar.
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!segredo || req.headers["x-telegram-bot-api-secret-token"] !== segredo) {
    return res.status(401).end();
  }

  const update = req.body;
  if (!update || typeof update !== "object" || typeof update.update_id !== "number") {
    return res.status(400).end();
  }

  try {
    await tratarUpdate(update);
  } catch (e) {
    // Loga mas responde 200 mesmo assim: erro nosso não pode virar loop de
    // re-entrega do Telegram (que reenvia o update até receber 2xx).
    console.error(`Webhook: falha no update ${update.update_id}: ${e.message}`);
  }

  return res.status(200).json({ ok: true });
}

// Anuncia uma nova versão do VagaMatch pra todos os usuários com Telegram vinculado.
// Uso: node scripts/broadcast-versao.js "1.0.1" "Adicionamos filtro de salário mínimo e comando /ajuda."
import { env, requireEnv } from "../worker/config.js";
import { supabase } from "../worker/db.js";

requireEnv(["telegramBotToken", "supabaseUrl", "supabaseServiceKey"]);

const [versao, ...resto] = process.argv.slice(2);
const mensagemMelhorias = resto.join(" ");

if (!versao || !mensagemMelhorias) {
  console.error('Uso: node scripts/broadcast-versao.js "1.0.1" "Descrição das melhorias"');
  process.exit(1);
}

const API = (metodo) => `https://api.telegram.org/bot${env.telegramBotToken}/${metodo}`;

async function enviar(chatId, texto) {
  const res = await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "Markdown" }),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram sendMessage: ${JSON.stringify(data)}`);
  }
}

async function main() {
  const { data: perfis, error } = await supabase
    .from("profiles")
    .select("id, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  if (error) throw error;
  if (!perfis?.length) {
    console.log("Nenhum usuário com Telegram vinculado.");
    return;
  }

  const texto = `🚀 *VagaMatch atualizado — v${versao}*\n\n${mensagemMelhorias}`;

  let enviados = 0;
  let falhas = 0;
  for (const perfil of perfis) {
    try {
      await enviar(perfil.telegram_chat_id, texto);
      enviados++;
    } catch (e) {
      falhas++;
      console.error(`Falha ao notificar user ${perfil.id}: ${e.message}`);
    }
  }

  console.log(`Broadcast v${versao} enviado: ${enviados} ok, ${falhas} falha(s), ${perfis.length} total.`);
}

main().catch((e) => {
  console.error("Erro no broadcast:", e.message);
  process.exit(1);
});

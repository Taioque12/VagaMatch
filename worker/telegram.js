import { env } from "./config.js";
import { readFileSync } from "fs";
import { basename } from "path";

const API = (metodo) => `https://api.telegram.org/bot${env.telegramBotToken}/${metodo}`;

async function chamarApi(metodo, body) {
  const res = await fetch(API(metodo), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram ${metodo}: ${JSON.stringify(data)}`);
  }
  return data.result;
}

function botoesFeedback(callbackId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Candidatei-me", callback_data: `st:cand:${callbackId}` },
        { text: "🗑️ Descartar", callback_data: `st:desc:${callbackId}` },
      ],
    ],
  };
}

function escaparMarkdown(text) {
  if (!text) return text;
  return String(text).replace(/[_*[\]()~`>#+=|{}<\-!.\\]/g, '\\$&');
}

function legendaVaga(vaga) {
  const salario = vaga.salario_min && vaga.salario_max
    ? `💰 R$ ${Math.round(vaga.salario_min)}–${Math.round(vaga.salario_max)}`
    : null;

  return [
    `💼 *${escaparMarkdown(vaga.titulo)}*`,
    `🏢 ${escaparMarkdown(vaga.empresa)} — ${escaparMarkdown(vaga.local)}`,
    salario,
    `⭐ Score IA: ${vaga.score ?? 0}/100`,
    vaga.motivo_ia ? `\n💡 *Por que essa vaga é pra você:*\n${escaparMarkdown(vaga.motivo_ia)}\n` : null,
    `🔗 [Acessar Vaga na Adzuna](${vaga.url})`,
    `\n📄 _Clique em "Candidatei\\-me" para receber seu currículo ajustado\\!_`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Passo 5: Envia notificação como mensagem de texto (sem anexos) ─────────
// O currículo ajustado é gerado sob demanda quando o usuário clica "Candidatei-me"
// no webhook do Telegram, economizando 1 chamada Gemini por vaga notificada.
export async function notificarVaga(chatId, vaga, pdfPath) {
  const legenda = legendaVaga(vaga);

  // Se não tem PDF, envia só a mensagem normal (como era)
  if (!pdfPath) {
    const result = await chamarApi("sendMessage", {
      chat_id: chatId,
      text: legenda,
      parse_mode: "MarkdownV2",
      reply_markup: botoesFeedback(vaga.callback_id),
    });
    return result.message_id;
  }

  // Se tem PDF, envia via sendDocument
  const formPdf = new FormData();
  formPdf.append("chat_id", chatId);
  formPdf.append("caption", legenda);
  formPdf.append("parse_mode", "MarkdownV2");
  formPdf.append("reply_markup", JSON.stringify(botoesFeedback(vaga.callback_id)));
  formPdf.append(
    "document",
    new Blob([readFileSync(pdfPath)], { type: "application/pdf" }),
    basename(pdfPath)
  );

  const resPdf = await fetch(API("sendDocument"), { method: "POST", body: formPdf });
  const dataPdf = await resPdf.json();
  if (!resPdf.ok || dataPdf.ok === false) {
    throw new Error(`Telegram sendDocument (pdf): ${JSON.stringify(dataPdf)}`);
  }

  return dataPdf.result.message_id;
}

export async function enviarResumoDiario(chatId, vagas) {
  const linhas = vagas
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((v, i) => `${i + 1}. ${v.titulo} — ${v.empresa} (score ${v.score ?? 0})`);

  const texto = [`📋 *${vagas.length} vagas novas encontradas nesta rodada:*`, "", ...linhas].join("\n");
  await chamarApi("sendMessage", { chat_id: chatId, text: texto, parse_mode: "Markdown" });
}

// Alerta best-effort — usado só quando há um chat_id de "admin" configurado (opcional).
export async function alertarErro(chatId, mensagem) {
  if (!chatId) return;
  try {
    await chamarApi("sendMessage", {
      chat_id: chatId,
      text: `⚠️ *Erro no worker do VagaMatch:*\n${escaparMarkdown(mensagem)}`,
      parse_mode: "Markdown",
    });
  } catch (e) {
    console.error(`Falha ao enviar alerta de erro: ${e.message}`);
  }
}

export async function removerBotoes(chatId, messageId) {
  await chamarApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: Number(messageId),
    reply_markup: { inline_keyboard: [] },
  });
}

export async function responderCallback(callbackQueryId, texto) {
  await chamarApi("answerCallbackQuery", { callback_query_id: callbackQueryId, text: texto });
}

export async function buscarAtualizacoes(offset) {
  return chamarApi("getUpdates", {
    offset: offset ? Number(offset) + 1 : undefined,
    timeout: 0,
    allowed_updates: ["callback_query", "message"],
  });
}

export async function enviarMenu(chatId) {
  await chamarApi("sendMessage", {
    chat_id: chatId,
    text: "O que você quer fazer?",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Buscar vagas agora", callback_data: "busca:agora" }],
        [{ text: "📍 Configurar região", callback_data: "menu:regiao" }],
      ],
    },
  });
}

export async function enviarMensagemSimples(chatId, texto) {
  await chamarApi("sendMessage", { chat_id: chatId, text: texto, parse_mode: "Markdown" });
}

export async function enviarMenuRegiao(chatId) {
  await chamarApi("sendMessage", {
    chat_id: chatId,
    text: "Buscar vaga onde?",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📍 Minha região (raio 100km)", callback_data: "modo:regiao:100" }],
        [{ text: "📍 Minha região (raio 500km)", callback_data: "modo:regiao:500" }],
        [{ text: "🌎 Brasil todo", callback_data: "modo:brasil:0" }],
      ],
    },
  });
}

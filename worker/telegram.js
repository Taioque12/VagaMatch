import { readFileSync } from "fs";
import { basename } from "path";
import { env } from "./config.js";

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

// Escape do Markdown legado do Telegram (parse_mode: "Markdown"): _ * ` [ desbalanceados
// em conteúdo dinâmico (título/empresa vindos da API de vagas) derrubam a mensagem inteira
// com 400 "can't parse entities". Aplicar em TODO campo interpolado, nunca na moldura fixa.
export function escapeMd(texto) {
  return String(texto ?? "").replace(/([_*`\[])/g, "\\$1");
}

function botoesFeedback(callbackId) {
  return {
    inline_keyboard: [
      [
        { text: "👍 Relevante", callback_data: `fb:pos:${callbackId}` },
        { text: "👎 Não é bem isso", callback_data: `fb:neg:${callbackId}` },
      ],
    ],
  };
}

export function legendaVaga(vaga, palavrasCobertas) {
  return [
    `💼 *${escapeMd(vaga.titulo)}*`,
    `🏢 ${escapeMd(vaga.empresa)} — ${escapeMd(vaga.local)}`,
    vaga.salario_min ? `💰 R$ ${Math.round(vaga.salario_min)}–${Math.round(vaga.salario_max)}` : null,
    `⭐ Score: ${vaga.score ?? 0}`,
    `🔑 ${escapeMd(palavrasCobertas.join(", "))}`,
    `🔗 ${escapeMd(vaga.url)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Envia o(s) arquivo(s) de currículo pra um chat_id específico, com legenda + botões de feedback.
// Retorna o message_id da mensagem principal (docx).
export async function notificarVaga(chatId, vaga, docxPath, pdfPath, palavrasCobertas) {
  const legenda = legendaVaga(vaga, palavrasCobertas);

  const formDocx = new FormData();
  formDocx.append("chat_id", chatId);
  formDocx.append("caption", legenda);
  formDocx.append("parse_mode", "Markdown");
  formDocx.append("reply_markup", JSON.stringify(botoesFeedback(vaga.callback_id)));
  formDocx.append(
    "document",
    new Blob([readFileSync(docxPath)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    basename(docxPath)
  );
  const resDocx = await fetch(API("sendDocument"), { method: "POST", body: formDocx });
  const dataDocx = await resDocx.json();
  if (!resDocx.ok || dataDocx.ok === false) {
    throw new Error(`Telegram sendDocument (docx): ${JSON.stringify(dataDocx)}`);
  }

  if (pdfPath) {
    const formPdf = new FormData();
    formPdf.append("chat_id", chatId);
    formPdf.append("caption", "Versão em PDF");
    formPdf.append(
      "document",
      new Blob([readFileSync(pdfPath)], { type: "application/pdf" }),
      basename(pdfPath)
    );
    const resPdf = await fetch(API("sendDocument"), { method: "POST", body: formPdf });
    if (!resPdf.ok) {
      console.error(`Falha ao enviar PDF: ${await resPdf.text()}`);
    }
  }

  return dataDocx.result.message_id;
}

// Mensagem de texto simples (sem moldura Markdown) — usada por fluxos que já recebem
// texto pronto (ex: confirmação de vínculo do Telegram), sem risco de entidade quebrada.
export async function enviarMensagem(chatId, texto) {
  await chamarApi("sendMessage", { chat_id: chatId, text: texto });
}

export async function enviarResumoDiario(chatId, vagas) {
  const linhas = vagas
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((v, i) => `${i + 1}. ${escapeMd(v.titulo)} — ${escapeMd(v.empresa)} (score ${v.score ?? 0})`);

  const texto = [`📋 *${vagas.length} vagas novas encontradas nesta rodada:*`, "", ...linhas].join("\n");
  await chamarApi("sendMessage", { chat_id: chatId, text: texto, parse_mode: "Markdown" });
}

// Alerta best-effort — usado só quando há um chat_id de "admin" configurado (opcional).
export async function alertarErro(chatId, mensagem) {
  if (!chatId) return;
  try {
    await chamarApi("sendMessage", {
      chat_id: chatId,
      text: `⚠️ *Erro no worker do VagaMatch:*\n${escapeMd(mensagem)}`,
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

export async function enviarMenuRegiao(chatId) {
  await chamarApi("sendMessage", {
    chat_id: chatId,
    text: "Buscar vaga onde?",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📍 Minha região (raio 50km)", callback_data: "modo:regiao:50" }],
        [{ text: "📍 Minha região (raio 100km)", callback_data: "modo:regiao:100" }],
        [{ text: "🌎 Brasil todo", callback_data: "modo:brasil:0" }],
      ],
    },
  });
}

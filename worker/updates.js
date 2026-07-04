// Tratamento de TODOS os updates do bot (1 bot serve todos os usuários).
// Substitui worker/feedback.js: com o webhook ativo na Vercel, o Telegram entrega
// cada update via HTTP em tempo real — getUpdates/offset deixam de existir.
import {
  buscarPorCallbackId,
  marcarFeedback,
  buscarPerfilPorChatId,
  solicitarBuscaManual,
  definirModoRegiao,
  vincularTelegramPorToken,
} from "./db.js";
import {
  responderCallback,
  removerBotoes,
  enviarMenu,
  enviarMenuRegiao,
  enviarMensagem,
} from "./telegram.js";

const TIPOS = { pos: "positivo", neg: "negativo" };
const TEXTOS = { pos: "Marcado como relevante 👍", neg: "Marcado como não relevante 👎" };

// Token vem de link público (t.me/...?start=...): validar formato antes de tocar no banco.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENSAGENS_VINCULO = {
  ok: "✅ Telegram conectado! A partir de agora suas vagas chegam aqui. Volte ao site e clique em \"Já conectei\".",
  token_invalido: "Este link de conexão não é válido. Gere um novo no seu perfil do VagaMatch.",
  token_expirado: "Este link de conexão expirou (validade de 15 minutos). Gere um novo no seu perfil do VagaMatch.",
  chat_em_uso: "Este Telegram já está conectado a outra conta do VagaMatch.",
};

async function tratarStart(msg, token) {
  if (!token || !UUID_RE.test(token)) {
    await enviarMenu(msg.chat.id);
    return;
  }
  const resultado = await vincularTelegramPorToken(token, msg.chat.id);
  await enviarMensagem(msg.chat.id, MENSAGENS_VINCULO[resultado.ok ? "ok" : resultado.motivo]);
}

async function tratarCallback(cq) {
  const data = cq.data ?? "";

  if (data.startsWith("fb:")) {
    const [, tipo, callbackId] = data.split(":");
    const tipoFeedback = TIPOS[tipo];
    if (!tipoFeedback) return;

    const vaga = await buscarPorCallbackId(callbackId);
    if (!vaga) {
      await responderCallback(cq.id, "Vaga não encontrada (registro antigo).");
      return;
    }
    await marcarFeedback(vaga.id, tipoFeedback);
    await responderCallback(cq.id, TEXTOS[tipo]);
    if (vaga.telegram_message_id && vaga.telegram_chat_id) {
      await removerBotoes(vaga.telegram_chat_id, vaga.telegram_message_id).catch(() => {});
    }
    return;
  }

  if (data === "busca:agora") {
    const perfil = await buscarPerfilPorChatId(cq.from.id);
    if (!perfil) {
      await responderCallback(cq.id, "Perfil não encontrado — conecte seu Telegram pelo site.");
      return;
    }
    await solicitarBuscaManual(perfil.id);
    // A busca em si continua rodando no cron do worker: prometer o que se entrega.
    await responderCallback(cq.id, "Busca agendada! O resultado chega na próxima rodada (em até 2h).");
    return;
  }

  if (data === "menu:regiao") {
    await responderCallback(cq.id);
    await enviarMenuRegiao(cq.message.chat.id);
    return;
  }

  if (data.startsWith("modo:")) {
    const [, modo, raio] = data.split(":");
    const perfil = await buscarPerfilPorChatId(cq.from.id);
    if (!perfil) {
      await responderCallback(cq.id, "Perfil não encontrado.");
      return;
    }
    const modoRegiao = modo === "brasil" ? "brasil" : "minha_regiao";
    await definirModoRegiao(perfil.id, modoRegiao, modoRegiao === "minha_regiao" ? Number(raio) : null);
    await responderCallback(
      cq.id,
      modoRegiao === "brasil" ? "Modo: Brasil todo ✅" : `Modo: minha região (raio ${raio}km) ✅`
    );
    return;
  }
}

async function tratarMensagem(msg) {
  const texto = (msg.text ?? "").trim();

  if (texto.startsWith("/start")) {
    await tratarStart(msg, texto.split(/\s+/)[1]);
    return;
  }
  if (texto === "/menu") {
    await enviarMenu(msg.chat.id);
    return;
  }
  if (texto === "/buscar") {
    const perfil = await buscarPerfilPorChatId(msg.chat.id);
    if (!perfil) return;
    await solicitarBuscaManual(perfil.id);
    await enviarMensagem(msg.chat.id, "Busca agendada! O resultado chega na próxima rodada (em até 2h).");
    return;
  }
  if (texto === "/regiao") {
    await enviarMenuRegiao(msg.chat.id);
    return;
  }
}

export async function tratarUpdate(update) {
  if (update.callback_query) {
    try {
      await tratarCallback(update.callback_query);
    } catch (e) {
      console.error(`Falha ao processar callback ${update.update_id}: ${e.message}`);
      await responderCallback(update.callback_query.id, "Erro ao processar.").catch(() => {});
    }
    return;
  }
  if (update.message) {
    await tratarMensagem(update.message);
  }
}

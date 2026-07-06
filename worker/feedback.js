import {
  getState,
  setState,
  buscarPorCallbackId,
  marcarFeedback,
  buscarPerfilPorChatId,
  solicitarBuscaManual,
  definirModoRegiao,
} from "./db.js";
import {
  buscarAtualizacoes,
  responderCallback,
  removerBotoes,
  enviarMenu,
  enviarMenuRegiao,
} from "./telegram.js";

const TIPOS = { pos: "positivo", neg: "negativo" };
const TEXTOS = { pos: "Marcado como relevante 👍", neg: "Marcado como não relevante 👎" };

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
      await responderCallback(cq.id, "Perfil não encontrado — vincule seu Telegram no onboarding.");
      return;
    }
    await solicitarBuscaManual(perfil.id);
    await responderCallback(cq.id, "Busca solicitada! Você recebe o resultado em instantes.");
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
    await responderCallback(cq.id, modoRegiao === "brasil" ? "Modo: Brasil todo ✅" : `Modo: minha região (raio ${raio}km) ✅`);
    return;
  }
}

async function tratarMensagem(msg) {
  const texto = (msg.text ?? "").trim();
  if (texto === "/menu" || texto === "/start") {
    await enviarMenu(msg.chat.id);
    return;
  }
  if (texto === "/buscar") {
    const perfil = await buscarPerfilPorChatId(msg.chat.id);
    if (!perfil) return;
    await solicitarBuscaManual(perfil.id);
    return;
  }
  if (texto === "/regiao") {
    await enviarMenuRegiao(msg.chat.id);
    return;
  }
}

// Processa comandos e cliques de botão de TODOS os usuários (1 bot só) desde a última rodada.
export async function processarFeedback() {
  const offsetSalvo = await getState("telegram_offset");
  const atualizacoes = await buscarAtualizacoes(offsetSalvo);
  if (!atualizacoes.length) return;

  let maiorUpdateId = offsetSalvo ? Number(offsetSalvo) : 0;

  for (const upd of atualizacoes) {
    maiorUpdateId = Math.max(maiorUpdateId, upd.update_id);
    try {
      if (upd.callback_query) await tratarCallback(upd.callback_query);
      else if (upd.message) await tratarMensagem(upd.message);
    } catch (e) {
      console.error(`Falha ao processar update ${upd.update_id}: ${e.message}`);
      if (upd.callback_query) await responderCallback(upd.callback_query.id, "Erro ao processar.").catch(() => {});
    }
  }

  await setState("telegram_offset", maiorUpdateId);
}

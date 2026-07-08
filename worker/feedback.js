import {
  getState,
  setState,
  buscarPorCallbackId,
  marcarStatus,
  buscarPerfilPorChatId,
  solicitarBuscaManual,
  definirModoRegiao,
  supabase,
} from "./db.js";
import {
  buscarAtualizacoes,
  responderCallback,
  removerBotoes,
  enviarMenu,
  enviarMenuRegiao,
  enviarMensagemSimples,
} from "./telegram.js";

const STATUS_POR_TIPO = { cand: "candidatado", desc: "descartada" };
const TEXTOS_STATUS = { cand: "Marcado como candidatado ✅", desc: "Vaga descartada 🗑️" };

async function tratarCallback(cq) {
  const data = cq.data ?? "";

  if (data.startsWith("st:")) {
    const [, tipo, callbackId] = data.split(":");
    const status = STATUS_POR_TIPO[tipo];
    if (!status) return;

    const vaga = await buscarPorCallbackId(callbackId);
    if (!vaga) {
      await responderCallback(cq.id, "Vaga não encontrada (registro antigo).");
      return;
    }
    await marcarStatus(vaga.id, status);
    await responderCallback(cq.id, TEXTOS_STATUS[tipo]);
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
    const raioNum = Number(raio);
    const raioValido = Number.isFinite(raioNum) && raioNum > 0 && raioNum <= 5000 ? raioNum : 500;
    await definirModoRegiao(perfil.id, modoRegiao, modoRegiao === "minha_regiao" ? raioValido : null);
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
  if (texto === "/status") {
    const perfil = await buscarPerfilPorChatId(msg.chat.id);
    if (!perfil) return;
    const { data: pref, error } = await supabase.from('preferencias').select('cargos_alvo, palavras_chave, modo_regiao, raio_km').eq('user_id', perfil.id).maybeSingle();
    if (error) {
      console.error(`Falha ao buscar preferencias (/status) user ${perfil.id}: ${error.message}`);
      await enviarMensagemSimples(msg.chat.id, "Erro ao buscar seu status. Tente de novo mais tarde.");
      return;
    }
    if (pref) {
      const textoStatus = `👤 *Seu Status de Busca*\n\n🎯 *Cargos-alvo:*\n${(pref.cargos_alvo || []).join(', ')}\n\n🔑 *Palavras-chave:*\n${(pref.palavras_chave || []).join(', ')}\n\n📍 *Região:*\n${pref.modo_regiao === 'brasil' ? 'Brasil Todo' : 'Minha Região (' + (pref.raio_km || 500) + 'km)'}`;
      await enviarMensagemSimples(msg.chat.id, textoStatus);
    } else {
      await enviarMensagemSimples(msg.chat.id, "Nenhuma preferência configurada ainda.");
    }
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

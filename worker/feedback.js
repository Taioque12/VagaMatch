import { getState, setState, buscarPorCallbackId, marcarFeedback } from "./db.js";
import { buscarAtualizacoes, responderCallback, removerBotoes } from "./telegram.js";

const TIPOS = { pos: "positivo", neg: "negativo" };
const TEXTOS = { pos: "Marcado como relevante 👍", neg: "Marcado como não relevante 👎" };

// Processa cliques nos botões 👍/👎 de TODOS os usuários (1 bot só) desde a última rodada.
export async function processarFeedback() {
  const offsetSalvo = await getState("telegram_offset");
  const atualizacoes = await buscarAtualizacoes(offsetSalvo);
  if (!atualizacoes.length) return;

  let maiorUpdateId = offsetSalvo ? Number(offsetSalvo) : 0;

  for (const upd of atualizacoes) {
    maiorUpdateId = Math.max(maiorUpdateId, upd.update_id);
    const cq = upd.callback_query;
    if (!cq?.data?.startsWith("fb:")) continue;

    const [, tipo, callbackId] = cq.data.split(":");
    const tipoFeedback = TIPOS[tipo];
    if (!tipoFeedback) continue;

    try {
      const vaga = await buscarPorCallbackId(callbackId);
      if (!vaga) {
        await responderCallback(cq.id, "Vaga não encontrada (registro antigo).");
        continue;
      }
      await marcarFeedback(vaga.id, tipoFeedback);
      await responderCallback(cq.id, TEXTOS[tipo]);
      if (vaga.telegram_message_id && vaga.telegram_chat_id) {
        await removerBotoes(vaga.telegram_chat_id, vaga.telegram_message_id).catch(() => {});
      }
    } catch (e) {
      console.error(`Falha ao processar feedback (${callbackId}): ${e.message}`);
      await responderCallback(cq.id, "Erro ao registrar feedback.").catch(() => {});
    }
  }

  await setState("telegram_offset", maiorUpdateId);
}

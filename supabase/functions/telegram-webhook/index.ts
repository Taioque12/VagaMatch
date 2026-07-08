import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const API = (metodo: string) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${metodo}`;

async function chamarApi(metodo: string, body: any) {
  const res = await fetch(API(metodo), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    console.error(`Telegram ${metodo} error:`, data);
  }
  return data;
}

const STATUS_POR_TIPO: Record<string, string> = { cand: "candidatado", desc: "descartada" };
const TEXTOS_STATUS: Record<string, string> = { cand: "Marcado como candidatado ✅", desc: "Vaga descartada 🗑️" };

async function enviarMenu(chatId: string | number) {
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

async function enviarMenuRegiao(chatId: string | number) {
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

async function enviarMensagemSimples(chatId: string | number, texto: string) {
  await chamarApi("sendMessage", { chat_id: chatId, text: texto, parse_mode: "Markdown" });
}

async function tratarCallback(cq: any) {
  const data = cq.data ?? "";
  const cqId = cq.id;
  const fromId = cq.from.id;
  const chatId = cq.message?.chat?.id;

  const responderCallback = (text?: string) => chamarApi("answerCallbackQuery", { callback_query_id: cqId, text });

  if (data.startsWith("st:")) {
    const [, tipo, callbackId] = data.split(":");
    const status = STATUS_POR_TIPO[tipo];
    if (!status) return;

    const { data: vaga } = await supabase.from('vagas_vistas').select('id, telegram_message_id, telegram_chat_id').eq('callback_id', callbackId).maybeSingle();
    
    if (!vaga) {
      await responderCallback("Vaga não encontrada (registro antigo).");
      return;
    }
    await supabase.from('vagas_vistas').update({ status }).eq('id', vaga.id);
    await responderCallback(TEXTOS_STATUS[tipo]);
    
    if (vaga.telegram_message_id && vaga.telegram_chat_id) {
      await chamarApi("editMessageReplyMarkup", {
        chat_id: vaga.telegram_chat_id,
        message_id: vaga.telegram_message_id,
        reply_markup: { inline_keyboard: [] },
      });
    }
    return;
  }

  if (data === "busca:agora") {
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(fromId)).maybeSingle();
    if (!perfil) {
      await responderCallback("Perfil não encontrado — vincule seu Telegram no onboarding.");
      return;
    }
    await supabase.from("preferencias").update({ busca_solicitada: true }).eq("user_id", perfil.id);
    await responderCallback("Busca solicitada! Você recebe o resultado em instantes.");
    return;
  }

  if (data === "menu:regiao") {
    await responderCallback();
    if (chatId) await enviarMenuRegiao(chatId);
    return;
  }

  if (data.startsWith("modo:")) {
    const [, modo, raio] = data.split(":");
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(fromId)).maybeSingle();
    if (!perfil) {
      await responderCallback("Perfil não encontrado.");
      return;
    }
    const modoRegiao = modo === "brasil" ? "brasil" : "minha_regiao";
    const raioNum = Number(raio);
    const raioValido = Number.isFinite(raioNum) && raioNum > 0 && raioNum <= 5000 ? raioNum : 500;
    
    await supabase.from("preferencias").update({
      modo_regiao: modoRegiao,
      ...(modoRegiao === "minha_regiao" ? { raio_km: raioValido } : {})
    }).eq("user_id", perfil.id);

    await responderCallback(modoRegiao === "brasil" ? "Modo: Brasil todo ✅" : `Modo: minha região (raio ${raio}km) ✅`);
    return;
  }
}

async function tratarMensagem(msg: any) {
  const texto = (msg.text ?? "").trim();
  const chatId = msg.chat.id;

  if (texto === "/menu" || texto === "/start") {
    await enviarMenu(chatId);
    return;
  }
  
  if (texto === "/buscar") {
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(chatId)).maybeSingle();
    if (!perfil) return;
    await supabase.from("preferencias").update({ busca_solicitada: true }).eq("user_id", perfil.id);
    return;
  }
  
  if (texto === "/status") {
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(chatId)).maybeSingle();
    if (!perfil) return;
    
    const { data: pref, error } = await supabase.from('preferencias').select('cargos_alvo, palavras_chave, modo_regiao, raio_km').eq('user_id', perfil.id).maybeSingle();
    
    if (error) {
      console.error(`Falha ao buscar preferencias: ${error.message}`);
      await enviarMensagemSimples(chatId, "Erro ao buscar seu status. Tente de novo mais tarde.");
      return;
    }
    if (pref) {
      const textoStatus = `👤 *Seu Status de Busca*\n\n🎯 *Cargos-alvo:*\n${(pref.cargos_alvo || []).join(', ')}\n\n🔑 *Palavras-chave:*\n${(pref.palavras_chave || []).join(', ')}\n\n📍 *Região:*\n${pref.modo_regiao === 'brasil' ? 'Brasil Todo' : 'Minha Região (' + (pref.raio_km || 500) + 'km)'}`;
      await enviarMensagemSimples(chatId, textoStatus);
    } else {
      await enviarMensagemSimples(chatId, "Nenhuma preferência configurada ainda.");
    }
    return;
  }
  
  if (texto === "/regiao") {
    await enviarMenuRegiao(chatId);
    return;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const upd = await req.json();
    
    if (upd.callback_query) {
      await tratarCallback(upd.callback_query);
    } else if (upd.message) {
      await tratarMensagem(upd.message);
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("Erro no webhook:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
});

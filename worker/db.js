import { createClient } from "@supabase/supabase-js";
import { env } from "./config.js";

// service_role: ignora RLS — o worker age em nome de todos os usuários.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);

// Usuários com busca ativa e Telegram vinculado (pré-requisitos pra rodar o pipeline).
// Processa em lotes usando limit e offset para escalar infinitamente.
export async function listarUsuariosAtivos(limite = 50, offset = 0) {
  const { data: prefs, error } = await supabase
    .from("preferencias")
    .select("user_id, cargos_alvo, palavras_chave, regioes, modo_regiao, raio_km, disparo_manual, busca_solicitada")
    .eq("ativo", true)
    .or("disparo_manual.eq.false,busca_solicitada.eq.true")
    .order("user_id", { ascending: true })
    .range(offset, offset + limite - 1);

  if (error) throw new Error(`Supabase select (preferencias): ${error.message}`);
  if (!prefs?.length) return [];

  const userIds = prefs.map((p) => p.user_id);

  const [{ data: perfis, error: e2 }, { data: curriculos, error: e3 }] = await Promise.all([
    supabase.from("profiles").select("id, nome_completo, localizacao, telegram_chat_id").in("id", userIds),
    supabase.from("curriculos").select("*").in("user_id", userIds),
  ]);
  if (e2) throw new Error(`Supabase select (profiles): ${e2.message}`);
  if (e3) throw new Error(`Supabase select (curriculos): ${e3.message}`);

  const perfilPorId = new Map((perfis ?? []).map((p) => [p.id, p]));
  const curriculoPorId = new Map((curriculos ?? []).map((c) => [c.user_id, c]));

  return prefs
    .map((pref) => {
      const perfil = perfilPorId.get(pref.user_id);
      const curriculo = curriculoPorId.get(pref.user_id);
      return { pref, perfil, curriculo };
    })
    .filter(({ perfil }) => perfil?.telegram_chat_id); // sem Telegram vinculado, pula
}

// Zera o pedido de busca manual depois que o worker processou o usuário.
export async function limparBuscaSolicitada(userId) {
  const { error } = await supabase
    .from("preferencias")
    .update({ busca_solicitada: false })
    .eq("user_id", userId);
  if (error) throw new Error(`Supabase update (busca_solicitada): ${error.message}`);
}

// Usado pelos comandos do bot (/buscar, /regiao) — acha o dono do chat_id que escreveu.
export async function buscarPerfilPorChatId(chatId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome_completo, telegram_chat_id")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();
  if (error) throw new Error(`Supabase select (profile por chat_id): ${error.message}`);
  return data;
}

export async function solicitarBuscaManual(userId) {
  const { error } = await supabase
    .from("preferencias")
    .update({ busca_solicitada: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Supabase update (busca_solicitada): ${error.message}`);
}

export async function definirModoRegiao(userId, modoRegiao, raioKm) {
  const patch = { modo_regiao: modoRegiao };
  if (raioKm != null) patch.raio_km = raioKm;
  const { error } = await supabase.from("preferencias").update(patch).eq("user_id", userId);
  if (error) throw new Error(`Supabase update (modo_regiao): ${error.message}`);
}

// Retorna só as vagas ainda não vistas por ESSE usuário e registra as novas.
// O insert usa .select() pra devolver id/callback_id gerados, necessários pra notificar depois.
export async function deduplicarParaUsuario(userId, vagas) {
  if (!vagas.length) return [];
  const jobIds = vagas.map((v) => v.job_id);
  const { data: vistas, error } = await supabase
    .from("vagas_vistas")
    .select("job_id")
    .eq("user_id", userId)
    .in("job_id", jobIds);
  if (error) throw new Error(`Supabase select (vagas_vistas): ${error.message}`);

  const jaVistas = new Set((vistas ?? []).map((r) => r.job_id));
  const novas = vagas.filter((v) => !jaVistas.has(v.job_id));
  if (!novas.length) return [];

  const { data: inseridas, error: insErr } = await supabase
    .from("vagas_vistas")
    .insert(
      novas.map((v) => ({
        user_id: userId,
        job_id: v.job_id,
        titulo: v.titulo,
        empresa: v.empresa,
        fonte: v.fonte,
        url: v.url,
        status: "descoberta",
        score: v.score ?? 0,
      }))
    )
    .select();
  if (insErr) throw new Error(`Supabase insert (vagas_vistas): ${insErr.message}`);

  // Junta os dados originais da vaga (descrição etc.) com os campos gerados pelo banco.
  const porJobId = new Map(novas.map((v) => [v.job_id, v]));
  return inseridas.map((row) => ({ ...porJobId.get(row.job_id), ...row }));
}

export async function marcarStatus(id, status, curriculoPath = null) {
  const patch = { status };
  if (curriculoPath) patch.curriculo_gerado_path = curriculoPath;
  const { error } = await supabase.from("vagas_vistas").update(patch).eq("id", id);
  if (error) throw new Error(`Supabase update (status): ${error.message}`);
}

export async function salvarMessageId(id, messageId) {
  const { error } = await supabase
    .from("vagas_vistas")
    .update({ telegram_message_id: String(messageId) })
    .eq("id", id);
  if (error) throw new Error(`Supabase update (message_id): ${error.message}`);
}

// Usado pelo polling de feedback: acha a vaga + o Telegram chat_id do dono, pelo callback_id do botão.
export async function buscarPorCallbackId(callbackId) {
  const { data: vaga, error } = await supabase
    .from("vagas_vistas")
    .select("id, user_id, telegram_message_id")
    .eq("callback_id", callbackId)
    .maybeSingle();
  if (error) throw new Error(`Supabase select (callback_id): ${error.message}`);
  if (!vaga) return null;

  const { data: perfil, error: e2 } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", vaga.user_id)
    .maybeSingle();
  if (e2) throw new Error(`Supabase select (profile do callback): ${e2.message}`);

  return { ...vaga, telegram_chat_id: perfil?.telegram_chat_id };
}

export async function marcarFeedback(id, feedback) {
  const { error } = await supabase.from("vagas_vistas").update({ feedback }).eq("id", id);
  if (error) throw new Error(`Supabase update (feedback): ${error.message}`);
}

// Estado global do worker (ex: offset do getUpdates do bot — 1 bot serve todos os usuários).
export async function getState(key) {
  const { data, error } = await supabase.from("app_state").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`Supabase select (app_state): ${error.message}`);
  return data?.value ?? null;
}

export async function setState(key, value) {
  const { error } = await supabase
    .from("app_state")
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Supabase upsert (app_state): ${error.message}`);
}

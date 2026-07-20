import { createClient } from "@supabase/supabase-js";
import { env } from "./config.js";

// service_role: ignora RLS — o worker age em nome de todos os usuários.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);

// Usuários com busca ativa e Telegram vinculado (pré-requisitos pra rodar o pipeline).
// Processa em lotes usando cursor (lastUserId) em vez de offset numérico, evita pular/repetir.
export async function listarUsuariosAtivos(limite = 50, lastUserId = null) {
  // 1. Buscar prioritários (busca_solicitada = true) - ignoram o cursor
  const { data: prefsPrioritarios, error: err1 } = await supabase
    .from("preferencias")
    .select("user_id, cargos_alvo, palavras_chave, regioes, modo_regiao, raio_km, disparo_manual, busca_solicitada, ultima_busca_em")
    .eq("ativo", true)
    .eq("busca_solicitada", true)
    .limit(limite);

  if (err1) throw new Error(`Supabase select (prioritarios): ${err1.message}`);

  let prefs = prefsPrioritarios || [];
  const limiteRestante = limite - prefs.length;

  // 2. Completar com o lote normal usando o cursor
  if (limiteRestante > 0) {
    let queryNormal = supabase
      .from("preferencias")
      .select("user_id, cargos_alvo, palavras_chave, regioes, modo_regiao, raio_km, disparo_manual, busca_solicitada, ultima_busca_em")
      .eq("ativo", true)
      .eq("disparo_manual", false)
      .order("user_id", { ascending: true });

    if (lastUserId) {
      queryNormal = queryNormal.gt("user_id", lastUserId);
    }

    const { data: prefsNormais, error: err2 } = await queryNormal.limit(limiteRestante);
    if (err2) throw new Error(`Supabase select (normais): ${err2.message}`);

    if (prefsNormais) {
      const map = new Map(prefs.map((p) => [p.user_id, p]));
      for (const p of prefsNormais) {
        if (!map.has(p.user_id)) {
          map.set(p.user_id, p);
          prefs.push(p);
        }
      }
    }
  }

  if (!prefs.length) return [];

  const userIds = prefs.map((p) => p.user_id);

  const [{ data: perfis, error: e2 }, { data: curriculos, error: e3 }] = await Promise.all([
    supabase.from("profiles").select("id, nome_completo, localizacao, telegram_chat_id, plano, assinatura_status").in("id", userIds),
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

// Retorna só as vagas ainda não processadas por ESSE usuário e registra as novas.
// Dedup exclui jobs com status terminal (notificada/descartada/erro) — reprocessa "descoberta" se falhou.
// O insert usa .select() pra devolver id/callback_id gerados, necessários pra notificar depois.
export async function deduplicarParaUsuario(userId, vagas) {
  if (!vagas.length) return [];
  const jobIds = vagas.map((v) => v.job_id);
  const { data: vistas, error } = await supabase
    .from("vagas_vistas")
    .select("job_id, status")
    .eq("user_id", userId)
    .in("job_id", jobIds);
  if (error) throw new Error(`Supabase select (vagas_vistas): ${error.message}`);

  const jaProcessadas = new Set(
    (vistas ?? [])
      .filter((r) => ["notificada", "descartada", "erro"].includes(r.status))
      .map((r) => r.job_id)
  );
  const novas = vagas.filter((v) => !jaProcessadas.has(v.job_id));
  if (!novas.length) return [];

  const { data: inseridas, error: insErr } = await supabase
    .from("vagas_vistas")
    .upsert(
      novas.map((v) => ({
        user_id: userId,
        job_id: v.job_id,
        titulo: v.titulo,
        empresa: v.empresa,
        fonte: v.fonte,
        url: v.url,
        status: "pendente_processamento",
        score: v.score ?? 0,
        motivo_ia: v.motivo_ia ?? null,
        salario_min: v.salario_min ?? null,
        salario_max: v.salario_max ?? null,
        descricao: (v.descricao || v.resumo || "").slice(0, 4000) || null,
      })),
      { onConflict: 'user_id,job_id' }
    )
    .select();
  if (insErr) throw new Error(`Supabase insert (vagas_vistas): ${insErr.message}`);

  // Junta os dados originais da vaga (descrição etc.) com os campos gerados pelo banco.
  const porJobId = new Map(novas.map((v) => [v.job_id, v]));
  return inseridas.map((row) => ({ ...porJobId.get(row.job_id), ...row }));
}

// Vagas travadas em 'pendente_processamento' há mais que minIdadeMs — geradas
// numa rodada que morreu no meio (timeout do Actions, crash) antes de avaliar
// essa vaga. Como não reaparecem na busca bruta seguinte, o dedup nunca as
// reinclui sozinho; o worker precisa buscá-las explicitamente e reprocessar.
export async function buscarPendentesAntigas(userId, minIdadeMs, limite = 30) {
  const cutoff = new Date(Date.now() - minIdadeMs).toISOString();
  const { data, error } = await supabase
    .from("vagas_vistas")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pendente_processamento")
    .lt("data_encontrada", cutoff)
    .order("data_encontrada", { ascending: true })
    .limit(limite);
  if (error) throw new Error(`Supabase select (pendentes antigas): ${error.message}`);
  return data ?? [];
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

// Estado global do worker (ex: offset do getUpdates do bot — 1 bot serve todos os usuários).
export async function getState(key) {
  const { data, error } = await supabase.from("app_state").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`Supabase select (app_state): ${error.message}`);
  return data?.value ?? null;
}

// Retorna value + updated_at — usado pelo cache de buscas pra verificar TTL.
export async function getStateWithTimestamp(key) {
  const { data, error } = await supabase
    .from("app_state")
    .select("value, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Supabase select (app_state): ${error.message}`);
  return data ?? null;
}

export async function setState(key, value) {
  const { error } = await supabase
    .from("app_state")
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Supabase upsert (app_state): ${error.message}`);
}

// ─── Fase A (V3): embeddings de vagas ────────────────────────────────────────
// Grava embeddings gerados em batch. Update por linha (upsert exigiria todas as
// colunas NOT NULL); falha em uma vaga não derruba as demais.
export async function salvarEmbeddingsVagas(pares) {
  const resultados = await Promise.allSettled(
    pares.map(({ id, embedding }) =>
      supabase.from("vagas_vistas").update({ embedding }).eq("id", id)
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        })
    )
  );
  const falhas = resultados.filter((r) => r.status === "rejected");
  if (falhas.length) {
    console.warn(`salvarEmbeddingsVagas: ${falhas.length}/${pares.length} updates falharam (${falhas[0].reason?.message}).`);
  }
  return pares.length - falhas.length;
}

// Camada 0 (V3): similaridade coseno currículo×vaga via RPC (migration 017).
// Retorna número em [0..1] ou null (embedding faltando ou erro) — null = sem
// sinal vetorial, chamador segue o fluxo normal (fail-open).
export async function similaridadeVagaCurriculo(userId, vagaId) {
  const { data, error } = await supabase.rpc("match_vaga_curriculo", {
    p_user_id: userId,
    p_vaga_id: vagaId,
  });
  if (error) {
    console.warn(`RPC match_vaga_curriculo falhou (${vagaId}): ${error.message}`);
    return null;
  }
  return typeof data === "number" ? data : null;
}

// Fase C (V3): similaridade da vaga com descartes/candidaturas recentes do
// usuário. Retorna { simDescartes, simCandidaturas } (cada um pode ser null)
// ou null em erro/sem embedding — fail-open.
export async function ajusteFeedbackVetorial(userId, vagaId) {
  const { data, error } = await supabase.rpc("ajuste_feedback_vetorial", {
    p_user_id: userId,
    p_vaga_id: vagaId,
  });
  if (error) {
    console.warn(`RPC ajuste_feedback_vetorial falhou (${vagaId}): ${error.message}`);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    simDescartes: typeof row.sim_descartes === "number" ? row.sim_descartes : null,
    simCandidaturas: typeof row.sim_candidaturas === "number" ? row.sim_candidaturas : null,
  };
}

// Fase C (V3): feedback recente do usuário pro resumo semanal (esboço da
// resumirFeedbackSemanal em swarm.js). Retorna títulos/empresas, não embeddings.
export async function listarFeedbackRecente(userId, dias = 7) {
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("vagas_vistas")
    .select("titulo, empresa, local, status")
    .eq("user_id", userId)
    .in("status", ["descartada", "candidatado"])
    .gte("feedback_em", cutoff)
    .order("feedback_em", { ascending: false })
    .limit(60);
  if (error) throw new Error(`Supabase select (feedback recente): ${error.message}`);
  return {
    descartes: (data || []).filter((v) => v.status === "descartada"),
    candidaturas: (data || []).filter((v) => v.status === "candidatado"),
  };
}

// Config V3 calibrável a quente via app_state (defaults semeados nas migrations 017/018).
export async function lerConfigV3() {
  const [prefiltro, threshold, pesosRaw, fator] = await Promise.all([
    getState("v3_prefiltro"),
    getState("v3_threshold_similaridade"),
    getState("v3_pesos_score"),
    getState("v3_fator_feedback"),
  ]);
  let pesos = { vetor: 0.5, tecnico: 0.3, fit: 0.2 };
  try {
    if (pesosRaw) pesos = { ...pesos, ...JSON.parse(pesosRaw) };
  } catch (e) {
    console.warn(`v3_pesos_score inválido em app_state, usando defaults: ${e.message}`);
  }
  const thresholdNum = Number(threshold);
  const fatorNum = Number(fator);
  return {
    prefiltroAtivo: prefiltro === "on",
    threshold: Number.isFinite(thresholdNum) ? thresholdNum : 0.55,
    pesos,
    fatorFeedback: Number.isFinite(fatorNum) ? fatorNum : 0.15,
  };
}

// GC do cache de buscas: remove só chaves 'cache_busca:*' vencidas.
// O filtro .like no prefixo garante que chaves de lock (worker_running,
// worker_last_user_id etc.) nunca são tocadas.
export async function limparCacheVencido(maxIdadeMs) {
  const cutoff = new Date(Date.now() - maxIdadeMs).toISOString();
  const { error, count } = await supabase
    .from("app_state")
    .delete({ count: "exact" })
    .like("key", "cache_busca:%")
    .lt("updated_at", cutoff);
  if (error) throw new Error(`Supabase delete (cache GC): ${error.message}`);
  return count ?? 0;
}

// Registra falha não-429 numa vaga; ao atingir maxTentativas marca 'erro'
// (status terminal — dedup para de reprocessar). Read-modify-write é seguro:
// cada vaga é processada por no máximo 1 worker por vez (lock de execução).
export async function registrarFalhaVaga(id, maxTentativas = 3) {
  const { data, error } = await supabase
    .from("vagas_vistas")
    .select("tentativas")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase select (tentativas): ${error.message}`);

  const tentativas = (data?.tentativas ?? 0) + 1;
  const patch = { tentativas };
  if (tentativas >= maxTentativas) patch.status = "erro";

  const { error: upErr } = await supabase.from("vagas_vistas").update(patch).eq("id", id);
  if (upErr) throw new Error(`Supabase update (tentativas): ${upErr.message}`);
  return tentativas;
}

export async function atualizarScoreIA(id, scoreIA, motivoIA) {
  const { error } = await supabase
    .from("vagas_vistas")
    .update({ score: scoreIA, motivo_ia: motivoIA })
    .eq("id", id);
  if (error) throw new Error(`Supabase update (score_ia): ${error.message}`);
}

// Quota do plano free (1 busca/24h): marca o timestamp da última busca
// processada com sucesso. Só chamado pra usuários free.
export async function registrarBuscaRealizada(userId) {
  const { error } = await supabase
    .from("preferencias")
    .update({ ultima_busca_em: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(`Supabase update (ultima_busca_em): ${error.message}`);
}

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "";

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = origin === APP_URL || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : APP_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(req, { error: "Configuração incompleta no servidor." }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: "Não autenticado." }, 401);

  let body: { action?: string };
  try { body = await req.json(); }
  catch { return json(req, { error: "Body inválido." }, 400); }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: allowed, error: limitError } = await admin.rpc("consume_rate_limit", {
    p_scope: `lgpd-rights:${body.action ?? "unknown"}`,
    p_subject_id: authData.user.id,
    p_limit: 3,
    p_window_seconds: 3600,
  });
  if (limitError) return json(req, { error: "Não foi possível validar o limite da solicitação." }, 503);
  if (!allowed) return json(req, { error: "Limite de solicitações atingido. Tente novamente mais tarde." }, 429);

  if (body.action === "export") {
    const userId = authData.user.id;
    const [profile, curriculum, preferences, jobs, interviews, referrals, requests] = await Promise.all([
      userClient.from("profiles").select("nome_completo, localizacao, telegram_chat_id, plano, assinatura_status, assinatura_recorrencia, assinatura_inicio, assinatura_proxima_cobranca, created_at, updated_at").eq("id", userId).maybeSingle(),
      userClient.from("curriculos").select("resumo_profissional, habilidades, experiencias, formacao, cursos, projetos, updated_at").eq("user_id", userId).maybeSingle(),
      userClient.from("preferencias").select("cargos_alvo, palavras_chave, regioes, modalidade_trabalho, raio_km, salario_minimo, ativo, updated_at").eq("user_id", userId).maybeSingle(),
      userClient.from("vagas_vistas").select("job_id, titulo, empresa, fonte, url, score, data_encontrada, status, feedback, salario_min, salario_max, descricao").eq("user_id", userId),
      userClient.from("entrevistas").select("vaga_id, status, historico, perguntas_feitas, created_at, updated_at").eq("user_id", userId),
      userClient.from("indicacoes").select("status, created_at, pago_em").eq("indicador_id", userId),
      userClient.from("lgpd_requests").select("request_type, status, requested_at, updated_at, completed_at").eq("user_id", userId),
    ]);
    const failed = [profile, curriculum, preferences, jobs, interviews, referrals, requests].find((result) => result.error);
    if (failed?.error) {
      console.error("lgpd-rights: falha na exportação", failed.error.message);
      return json(req, { error: "Não foi possível preparar a exportação." }, 500);
    }
    return json(req, {
      exported_at: new Date().toISOString(),
      account: { id: userId, email: authData.user.email, created_at: authData.user.created_at },
      profile: profile.data,
      curriculum: curriculum.data,
      preferences: preferences.data,
      jobs: jobs.data ?? [],
      interviews: interviews.data ?? [],
      referrals: referrals.data ?? [],
      privacy_requests: requests.data ?? [],
    });
  }

  if (body.action === "request_deletion") {
    const { data: existing } = await userClient.from("lgpd_requests")
      .select("id, status, requested_at")
      .eq("user_id", authData.user.id)
      .eq("request_type", "account_deletion")
      .in("status", ["pending", "in_review"])
      .maybeSingle();
    if (existing) return json(req, { request: existing, already_exists: true });
    const { data, error } = await userClient.from("lgpd_requests").insert({
      user_id: authData.user.id,
      request_type: "account_deletion",
      status: "pending",
    }).select("id, status, requested_at").single();
    if (error) {
      console.error("lgpd-rights: falha ao solicitar exclusão", error.message);
      return json(req, { error: "Não foi possível registrar a solicitação." }, 500);
    }
    return json(req, { request: data }, 201);
  }

  if (body.action === "cancel_deletion") {
    const { data, error } = await userClient.from("lgpd_requests")
      .update({ status: "cancelled" })
      .eq("user_id", authData.user.id)
      .eq("request_type", "account_deletion")
      .eq("status", "pending")
      .select("id, status, updated_at")
      .maybeSingle();
    if (error) return json(req, { error: "Não foi possível cancelar a solicitação." }, 500);
    return json(req, { request: data });
  }

  return json(req, { error: "Ação inválida." }, 400);
});

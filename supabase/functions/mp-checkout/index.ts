// Edge Function: cria assinatura (preapproval) no Mercado Pago pro usuário logado.
// O MP_ACCESS_TOKEN fica só aqui (env server-side). Valida o JWT via GoTrue
// (mesmo padrão do gemini-proxy) antes de criar qualquer cobrança.
import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Preços em BRL. Anual é cobrado em 12 parcelas mensais com desconto
// (equivalente mensal de src/lib/planos.js: 32 e 57).
const PRECOS: Record<string, Record<string, { valor: number; frequency: number; label: string }>> = {
  match: {
    mensal: { valor: 39, frequency: 1, label: "VagaMatch — Match (mensal)" },
    anual: { valor: 384, frequency: 12, label: "VagaMatch — Match (anual)" },
  },
  match_plus: {
    mensal: { valor: 69, frequency: 1, label: "VagaMatch — Match Plus (mensal)" },
    anual: { valor: 684, frequency: 12, label: "VagaMatch — Match Plus (anual)" },
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (!MP_ACCESS_TOKEN || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Configuração incompleta no servidor." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return json({ error: "Não autenticado." }, 401);
  }
  const user = userData.user;

  let body: { plano?: string; recorrencia?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const { plano, recorrencia } = body;
  const preco = plano && recorrencia ? PRECOS[plano]?.[recorrencia] : undefined;
  if (!preco) {
    return json({ error: "Use plano 'match'|'match_plus' e recorrencia 'mensal'|'anual'." }, 400);
  }
  if (!user.email) return json({ error: "Usuário sem e-mail cadastrado." }, 400);

  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await admin.from("profiles")
    .select("assinatura_status").eq("id", user.id).maybeSingle();
  if (profile?.assinatura_status === "ativa") {
    return json({ error: "Você já possui uma assinatura ativa." }, 409);
  }

  const lockOwner = crypto.randomUUID();
  const { data: lockAcquired, error: lockError } = await admin.rpc("acquire_distributed_lock", {
    p_lock_name: `mp-checkout:${user.id}`,
    p_owner_id: lockOwner,
    p_lease_seconds: 60,
  });
  if (lockError || !lockAcquired) return json({ error: "Outro checkout está em andamento. Tente novamente em instantes." }, 409);

  try {
    const { data: checkout, error: reserveError } = await admin.rpc("reserve_mp_checkout", {
      p_user_id: user.id, p_plano: plano, p_recorrencia: recorrencia, p_owner_id: lockOwner,
    });
    if (reserveError || !checkout) return json({ error: "Não foi possível reservar o checkout." }, 503);
    if (checkout.status === "ready" && checkout.init_point) {
      if (checkout.plano !== plano || checkout.recorrencia !== recorrencia) {
        return json({ error: "Já existe um checkout pendente para outro plano. Conclua ou cancele esse checkout antes de trocar." }, 409);
      }
      return json({ init_point: checkout.init_point });
    }
    if (checkout.status === "creating" && checkout.request_owner_id !== lockOwner) {
      return json({ error: "Um checkout já está sendo preparado. Aguarde alguns segundos." }, 409);
    }

    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: preco.label,
        external_reference: user.id,
        payer_email: user.email,
        back_url: `${APP_URL}/sucesso`,
        auto_recurring: {
          frequency: preco.frequency,
          frequency_type: "months",
          transaction_amount: preco.valor,
          currency_id: "BRL",
        },
        status: "pending",
      }),
    });

    if (!res.ok) {
      const corpo = (await res.text()).slice(0, 300);
      console.error(`Mercado Pago ${res.status}: ${corpo}`);
      await admin.from("mp_checkout_sessions").update({
        status: "failed", request_owner_id: null, updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      return json({ error: "Falha ao criar assinatura no Mercado Pago." }, 502);
    }

    const data = await res.json();
    if (!data?.init_point) {
      await admin.from("mp_checkout_sessions").update({
        status: "failed", request_owner_id: null, updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      return json({ error: "Mercado Pago não retornou init_point." }, 502);
    }
    await admin.from("mp_checkout_sessions").update({
      status: "ready", mp_preapproval_id: data.id ? String(data.id) : null,
      init_point: data.init_point, request_owner_id: null, updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    return json({ init_point: data.init_point });
  } catch (error) {
    await admin.from("mp_checkout_sessions").update({ status: "failed", request_owner_id: null, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    console.error(`Falha ao chamar Mercado Pago: ${error.message}`);
    return json({ error: "Erro interno ao criar assinatura." }, 500);
  } finally {
    await admin.rpc("release_distributed_lock", {
      p_lock_name: `mp-checkout:${user.id}`,
      p_owner_id: lockOwner,
    });
  }
});

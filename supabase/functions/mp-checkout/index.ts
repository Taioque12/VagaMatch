// Edge Function: cria assinatura (preapproval) no Mercado Pago pro usuário logado.
// O MP_ACCESS_TOKEN fica só aqui (env server-side). Valida o JWT via GoTrue
// (mesmo padrão do gemini-proxy) antes de criar qualquer cobrança.
import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

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
  if (!MP_ACCESS_TOKEN) return json({ error: "MP_ACCESS_TOKEN não configurado no servidor." }, 500);

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

  try {
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
      return json({ error: "Falha ao criar assinatura no Mercado Pago." }, 502);
    }

    const data = await res.json();
    if (!data?.init_point) return json({ error: "Mercado Pago não retornou init_point." }, 502);
    return json({ init_point: data.init_point });
  } catch (error) {
    console.error(`Falha ao chamar Mercado Pago: ${error.message}`);
    return json({ error: "Erro interno ao criar assinatura." }, 500);
  }
});

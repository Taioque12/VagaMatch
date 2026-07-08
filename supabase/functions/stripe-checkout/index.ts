import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.16.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "http://localhost:5173"; // URL do frontend

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  if (!STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY não configurada." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return json({ error: "Não autenticado." }, 401);
  }

  const userId = userData.user.id;
  const email = userData.user.email;

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const { priceId } = payload;
  if (!priceId) return json({ error: "Campo 'priceId' obrigatório." }, 400);

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    // Busca se o usuário já tem um customer_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      // Cria customer no stripe
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          user_id: userId,
        },
      });
      customerId = customer.id;

      // Update usando a Service Role Key para ignorar RLS e atualizar a coluna protegida
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    // Cria a sessão de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card", "pix"], // Adicionando PIX nativo
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${SITE_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cancelado`,
      client_reference_id: userId, // Garante que sabemos quem pagou
      metadata: {
        user_id: userId,
      },
    });

    return json({ url: session.url });
  } catch (error: any) {
    return json({ error: `Falha ao criar sessão do Stripe: ${error.message}` }, 500);
  }
});

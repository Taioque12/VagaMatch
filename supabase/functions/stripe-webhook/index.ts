import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.16.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  if (!signature || !STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing signature ou webhook secret", { status: 400 });
  }

  let event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature falhou: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Admin client para bypass RLS e atualizar colunas protegidas
  const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.user_id;
        const subscriptionId = session.subscription as string;
        
        if (userId && subscriptionId) {
          // Quando finaliza o checkout, pega dados da subscription para saber recorrência
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const interval = subscription.items.data[0].plan.interval; // 'month' ou 'year'
          
          await supabaseAdmin
            .from("profiles")
            .update({
              assinatura_status: "ativa",
              plano: "pago",
              stripe_subscription_id: subscriptionId,
              assinatura_recorrencia: interval === "year" ? "anual" : "mensal",
              assinatura_inicio: new Date(subscription.current_period_start * 1000).toISOString(),
              assinatura_proxima_cobranca: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq("id", userId);

          // Primeira mensalidade paga: credita quem indicou (evita fraude de conta fake, só paga de verdade).
          const { data: indicacao } = await supabaseAdmin
            .from("indicacoes")
            .select("id, indicador_id")
            .eq("indicado_id", userId)
            .eq("status", "pendente")
            .maybeSingle();

          if (indicacao) {
            await supabaseAdmin
              .from("indicacoes")
              .update({ status: "pago", pago_em: new Date().toISOString() })
              .eq("id", indicacao.id);

            const { data: indicadorProfile } = await supabaseAdmin
              .from("profiles")
              .select("creditos_indicacao")
              .eq("id", indicacao.indicador_id)
              .maybeSingle();

            await supabaseAdmin
              .from("profiles")
              .update({ creditos_indicacao: (indicadorProfile?.creditos_indicacao ?? 0) + 1 })
              .eq("id", indicacao.indicador_id);
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await supabaseAdmin
            .from("profiles")
            .update({
              assinatura_status: "ativa",
              assinatura_proxima_cobranca: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }
      
      case "invoice.payment_failed":
      case "customer.subscription.deleted": {
        const obj = event.data.object as any;
        const subscriptionId = obj.subscription || obj.id; // no invoice é .subscription, no customer.subscription é .id
        
        if (subscriptionId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              assinatura_status: event.type === "invoice.payment_failed" ? "pendente" : "cancelada",
              plano: "gratis",
            })
            .eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error: any) {
    console.error(`Erro ao processar webhook: ${error.message}`);
    return new Response(`Erro ao processar: ${error.message}`, { status: 500 });
  }
});

// Edge Function: webhook de assinaturas do Mercado Pago.
// Sem JWT (o MP não manda Authorization) — deploy com --no-verify-jwt.
// Segurança:
//   1. Valida x-signature (HMAC-SHA256 com MP_WEBHOOK_SECRET) — request sem
//      assinatura válida recebe 401.
//   2. NUNCA confia no payload: reconsulta GET /preapproval/{id} na API do MP
//      com MP_ACCESS_TOKEN e só então atualiza o profile (service role).
// Erros de processamento retornam 200 (com log) pra evitar retry storm do MP.
import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const MP_WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function ok(body: unknown = { received: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Compara em tempo constante — evita timing attack na assinatura.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Valida o header x-signature do MP: "ts=...,v1=..."
// Manifest oficial: id:{data.id};request-id:{x-request-id};ts:{ts};
async function validarAssinatura(req: Request, dataId: string): Promise<boolean> {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !MP_WEBHOOK_SECRET) return false;

  const partes = new Map<string, string>();
  for (const parte of xSignature.split(",")) {
    const [k, ...v] = parte.split("=");
    if (k && v.length) partes.set(k.trim(), v.join("=").trim());
  }
  const ts = partes.get("ts");
  const v1 = partes.get("v1");
  if (!ts || !v1) return false;

  let manifest = `id:${dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const esperado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(esperado, v1.toLowerCase());
}

// Deriva o plano do label enviado no checkout (reason) ou do external_reference.
function derivarPlano(reason: string | null | undefined): string {
  const r = (reason ?? "").toLowerCase();
  return r.includes("plus") ? "match_plus" : "match";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "Método não permitido." }, 405);
  if (!MP_ACCESS_TOKEN || !MP_WEBHOOK_SECRET || !SERVICE_ROLE_KEY) {
    console.error("mp-webhook: secrets faltando (MP_ACCESS_TOKEN/MP_WEBHOOK_SECRET/SERVICE_ROLE_KEY).");
    return ok({ error: "Configuração incompleta." }, 500);
  }

  // data.id vem na query (?data.id=...) ou no body ({ data: { id } }).
  const url = new URL(req.url);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // body vazio/não-JSON — segue com a query string
  }
  const dataId: string | undefined =
    url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? body?.data?.id;

  if (!dataId) {
    console.warn("mp-webhook: notificação sem data.id, ignorando.");
    return ok(); // 200 — nada a fazer, não vale retry
  }

  // ─── 1. Assinatura obrigatória — inválida → 401 (MP reenvia se for real) ──
  const assinaturaValida = await validarAssinatura(req, String(dataId));
  if (!assinaturaValida) {
    console.warn(`mp-webhook: assinatura inválida (data.id=${dataId}).`);
    return ok({ error: "Assinatura inválida." }, 401);
  }

  // Só nos interessam eventos de assinatura (preapproval).
  const tipo = body?.type ?? url.searchParams.get("type") ?? "";
  if (tipo && !String(tipo).includes("preapproval") && !String(tipo).includes("subscription")) {
    return ok({ ignored: tipo });
  }

  // ─── 2. Reconsulta a fonte da verdade na API do MP ─────────────────────────
  try {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!res.ok) {
      console.error(`mp-webhook: GET /preapproval/${dataId} falhou (${res.status}).`);
      return ok({ error: "Falha ao consultar assinatura." }); // 200 — evita retry storm
    }
    const preapproval = await res.json();

    const userId: string | undefined = preapproval?.external_reference;
    if (!userId) {
      console.error(`mp-webhook: preapproval ${dataId} sem external_reference.`);
      return ok();
    }

    const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
    const status: string = preapproval?.status ?? "";

    let patch: Record<string, unknown> | null = null;
    if (status === "authorized") {
      const freq = preapproval?.auto_recurring?.frequency ?? 1;
      const inicio = preapproval?.date_created ?? new Date().toISOString();
      const proxima =
        preapproval?.next_payment_date ??
        new Date(Date.now() + freq * 30 * 24 * 60 * 60 * 1000).toISOString();
      patch = {
        plano: derivarPlano(preapproval?.reason),
        assinatura_status: "ativa",
        assinatura_recorrencia: freq >= 12 ? "anual" : "mensal",
        assinatura_inicio: inicio,
        assinatura_proxima_cobranca: proxima,
        mp_preapproval_id: String(preapproval.id),
        mp_payer_id: preapproval?.payer_id != null ? String(preapproval.payer_id) : null,
      };
    } else if (status === "cancelled" || status === "paused") {
      patch = {
        plano: "free",
        assinatura_status: status === "cancelled" ? "cancelada" : "pausada",
        mp_preapproval_id: String(preapproval.id),
      };
    } else {
      console.log(`mp-webhook: preapproval ${dataId} com status '${status}', sem ação.`);
      return ok({ ignored: status });
    }

    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) {
      console.error(`mp-webhook: update profiles falhou (user ${userId}): ${error.message}`);
      return ok({ error: "Falha ao atualizar perfil." }); // 200 — log + sem retry storm
    }

    console.log(`mp-webhook: user ${userId} → ${patch.assinatura_status} (${status}).`);
    return ok();
  } catch (error) {
    console.error(`mp-webhook: erro de processamento (data.id=${dataId}): ${error.message}`);
    return ok({ error: "Erro interno." }); // 200 — evita retry storm
  }
});

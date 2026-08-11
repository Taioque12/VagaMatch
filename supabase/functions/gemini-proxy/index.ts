// Edge Function: proxy autenticado pro Gemini. A API key do Gemini fica só aqui
// (env server-side), nunca no bundle do frontend. Só aceita chamadas de usuários
// autenticados (valida o JWT via GoTrue antes de gastar cota).
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limit: 10 requisições por minuto por usuário
const RATE_LIMIT_PER_MINUTE = 10;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  if (!GEMINI_API_KEY || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Configuração incompleta no servidor." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return json({ error: "Não autenticado." }, 401);
  }

  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY);
  const { data: allowed, error: rateLimitError } = await admin.rpc("consume_rate_limit", {
    p_scope: "gemini-proxy",
    p_subject_id: userData.user.id,
    p_limit: RATE_LIMIT_PER_MINUTE,
    p_window_seconds: 60,
  });
  if (rateLimitError) {
    console.error("Falha no rate limit distribuído:", rateLimitError.message);
    return json({ error: "Não foi possível validar o limite de requisições." }, 503);
  }
  if (!allowed) {
    return json({ error: "Limite de requisições atingido (10/min). Tente de novo em 1 minuto." }, 429);
  }

  // Rejeita antes do parse: evita alocar memória com body gigante
  const MAX_PAYLOAD_SIZE = 20 * 1024 * 1024; // 20MB
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYLOAD_SIZE) {
    return json({ error: `Payload excede limite (${Math.round(contentLength / 1024 / 1024)}MB > 20MB).` }, 413);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const payloadSize = JSON.stringify(payload).length;
  if (payloadSize > MAX_PAYLOAD_SIZE) {
    return json({ error: `Payload excede limite (${Math.round(payloadSize / 1024 / 1024)}MB > 20MB).` }, 413);
  }

  // ─── Fase A (V3): rota de embeddings (gemini-embedding-001, 768 dims) ─────
  if (payload.task === "embed") {
    const texts = payload.texts;
    if (!Array.isArray(texts) || texts.length === 0 || texts.length > 10) {
      return json({ error: "Campo 'texts' deve ser array de 1 a 10 strings." }, 400);
    }
    if (texts.some((t) => typeof t !== "string" || !t.trim() || t.length > 20000)) {
      return json({ error: "Cada texto deve ser string não-vazia de até 20k chars." }, 400);
    }
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: texts.map((t) => ({
              model: "models/gemini-embedding-001",
              content: { parts: [{ text: t }] },
              outputDimensionality: 768,
            })),
          }),
        },
      );
      if (!res.ok) {
        const corpo = (await res.text()).slice(0, 300);
        return json({ error: `Gemini embed ${res.status}: ${corpo}` }, 502);
      }
      const data = await res.json();
      const embeddings = (data.embeddings ?? []).map((e: any) => e.values);
      if (embeddings.length !== texts.length) {
        return json({ error: "Gemini embed retornou quantidade inesperada de embeddings." }, 502);
      }
      return json({ embeddings });
    } catch (error) {
      return json({ error: `Falha ao gerar embedding: ${error.message}` }, 500);
    }
  }

  const { model = "gemini-flash-latest", contents, config } = payload;
  if (!contents) return json({ error: "Campo 'contents' obrigatório." }, 400);

  // Whitelist de modelos: 'model' entra na URL da API — sem isso o cliente
  // controla o path da requisição server-side.
  // gemini-2.5-* descontinuados p/ chaves novas (404 "no longer available to
  // new users") — gemini-flash-latest/gemini-pro-latest são os atuais.
  const MODELOS_PERMITIDOS = ["gemini-flash-latest", "gemini-pro-latest"];
  if (!MODELOS_PERMITIDOS.includes(model)) {
    return json({ error: "Modelo não permitido." }, 400);
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: Array.isArray(contents)
            ? [{ parts: contents.map((c) => (typeof c === "string" ? { text: c } : c)) }]
            : [{ parts: [{ text: contents }] }],
          ...(config?.responseMimeType
            ? { generationConfig: { responseMimeType: config.responseMimeType } }
            : {}),
        }),
      },
    );

    if (!res.ok) {
      const corpo = (await res.text()).slice(0, 300);
      return json({ error: `Gemini ${res.status}: ${corpo}` }, 502);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    if (!text) {
      // Resposta vazia geralmente é bloqueio de safety ou finishReason anormal —
      // devolver {text: ""} esconderia o motivo do frontend.
      const finish = data?.candidates?.[0]?.finishReason;
      // "STOP" é término normal — citar como motivo confundiria o usuário.
      const motivo = data?.promptFeedback?.blockReason || (finish !== "STOP" ? finish : null);
      return json({ error: `Gemini não retornou texto${motivo ? ` (motivo: ${motivo})` : ""}.` }, 502);
    }
    return json({ text });
  } catch (error) {
    return json({ error: `Falha ao chamar Gemini: ${error.message}` }, 500);
  }
});

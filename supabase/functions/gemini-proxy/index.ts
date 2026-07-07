// Edge Function: proxy autenticado pro Gemini. A API key do Gemini fica só aqui
// (env server-side), nunca no bundle do frontend. Só aceita chamadas de usuários
// autenticados (valida o JWT via GoTrue antes de gastar cota).
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY não configurada no servidor." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return json({ error: "Não autenticado." }, 401);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const { model = "gemini-2.5-flash", contents, config } = payload;
  if (!contents) return json({ error: "Campo 'contents' obrigatório." }, 400);

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
    return json({ text });
  } catch (error) {
    return json({ error: `Falha ao chamar Gemini: ${error.message}` }, 500);
  }
});

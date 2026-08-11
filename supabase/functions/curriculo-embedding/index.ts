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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function textoCurriculo(curriculo: Record<string, unknown>) {
  const experiencias = Array.isArray(curriculo.experiencias) ? curriculo.experiencias : [];
  const habilidades = Array.isArray(curriculo.habilidades) ? curriculo.habilidades : [];
  const formacao = Array.isArray(curriculo.formacao) ? curriculo.formacao : [];
  return [
    curriculo.resumo_profissional,
    habilidades.join(", "),
    ...experiencias.map((exp: any) => `${exp.cargo ?? ""} | ${exp.empresa ?? ""} | ${(exp.bullets ?? []).join("; ")}`),
    ...formacao,
  ].filter(Boolean).join("\n").slice(0, 20000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Configuração incompleta no servidor." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error: authError } = await authClient.auth.getUser();
  if (authError || !data.user) return json({ error: "Não autenticado." }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: curriculo, error: curriculoError } = await admin
    .from("curriculos")
    .select("resumo_profissional, habilidades, experiencias, formacao")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (curriculoError || !curriculo) return json({ error: "Currículo não encontrado." }, 404);

  const texto = textoCurriculo(curriculo);
  if (!texto.trim()) return json({ skipped: true });

  const gemini = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: texto }] },
        outputDimensionality: 768,
      }] }),
    },
  );
  if (!gemini.ok) return json({ error: "Falha ao gerar embedding." }, 502);
  const payload = await gemini.json();
  const embedding = payload?.embeddings?.[0]?.values;
  if (!Array.isArray(embedding) || embedding.length !== 768) return json({ error: "Embedding inválido." }, 502);

  const { error: updateError } = await admin
    .from("curriculos")
    .update({ embedding })
    .eq("user_id", data.user.id);
  if (updateError) return json({ error: "Falha ao salvar embedding." }, 500);

  return json({ ok: true });
});

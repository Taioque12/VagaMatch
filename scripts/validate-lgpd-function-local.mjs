import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appOrigin = "http://localhost:4173";
if (!url || !anonKey || !serviceKey) throw new Error("Variáveis do Supabase local são obrigatórias.");
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Teste recusado fora do ambiente local.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Local-${crypto.randomUUID()}-Aa1!`;
const users = [];

async function createTestUser(label) {
  const email = `lgpd-edge-${label}-${suffix}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  users.push(created.data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  return { id: created.data.user.id, email, token: signed.data.session.access_token };
}

async function invoke(token, action, origin = appOrigin) {
  return fetch(`${url}/functions/v1/lgpd-rights`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: token ? `Bearer ${token}` : "",
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ action }),
  });
}

try {
  const noJwt = await invoke(null, "export");
  assert.equal(noJwt.status, 401);
  const invalidJwt = await invoke("invalid.jwt.value", "export");
  assert.equal(invalidJwt.status, 401);

  const preflight = await fetch(`${url}/functions/v1/lgpd-rights`, {
    method: "OPTIONS",
    headers: { origin: appOrigin, "access-control-request-method": "POST" },
  });
  assert([appOrigin, "*"].includes(preflight.headers.get("access-control-allow-origin")));

  const untrusted = await fetch(`${url}/functions/v1/lgpd-rights`, {
    method: "OPTIONS",
    headers: { origin: "https://attacker.example", "access-control-request-method": "POST" },
  });
  assert([null, "", "*"].includes(untrusted.headers.get("access-control-allow-origin")));

  const first = await createTestUser("one");
  const second = await createTestUser("two");
  assert.ifError((await admin.from("profiles").update({ nome_completo: "Titular Local Um" }).eq("id", first.id)).error);
  assert.ifError((await admin.from("profiles").update({ nome_completo: "Titular Local Dois" }).eq("id", second.id)).error);
  assert.ifError((await admin.from("vagas_vistas").insert([
    { user_id: first.id, job_id: `first-${suffix}`, titulo: "Vaga do primeiro" },
    { user_id: second.id, job_id: `second-${suffix}`, titulo: "Vaga do segundo" },
  ])).error);

  const exported = await invoke(first.token, "export");
  assert.equal(exported.status, 200);
  const exportBody = await exported.json();
  assert.equal(exportBody.account.id, first.id);
  assert.equal(exportBody.profile.nome_completo, "Titular Local Um");
  assert.deepEqual(exportBody.jobs.map((job) => job.titulo), ["Vaga do primeiro"]);
  assert(!JSON.stringify(exportBody).includes("Titular Local Dois"));

  const requested = await invoke(first.token, "request_deletion");
  assert.equal(requested.status, 201);
  const duplicate = await invoke(first.token, "request_deletion");
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).already_exists, true);
  const cancelled = await invoke(first.token, "cancel_deletion");
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).request.status, "cancelled");

  const requestedAgain = await invoke(first.token, "request_deletion");
  assert.equal(requestedAgain.status, 201);
  const pendingRequest = await requestedAgain.json();
  assert.ifError((await admin
    .from("lgpd_requests")
    .update({ status: "in_review" })
    .eq("id", pendingRequest.request.id)).error);
  const cancelInReview = await invoke(first.token, "cancel_deletion");
  assert.equal(cancelInReview.status, 200);
  assert.equal((await cancelInReview.json()).request, null);
  const persisted = await admin
    .from("lgpd_requests")
    .select("status")
    .eq("id", pendingRequest.request.id)
    .single();
  assert.ifError(persisted.error);
  assert.equal(persisted.data.status, "in_review");

  const hostilePost = await invoke(second.token, "export", "https://attacker.example");
  assert.equal(hostilePost.status, 200);

  assert.equal((await invoke(first.token, "export")).status, 200);
  assert.equal((await invoke(first.token, "export")).status, 200);
  assert.equal((await invoke(first.token, "export")).status, 429);
  assert.equal((await invoke(first.token, "unknown_action")).status, 400);

  console.log("LGPD local Edge Function: PASS");
} finally {
  for (const id of users) {
    await admin.from("api_rate_limits").delete().eq("subject_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

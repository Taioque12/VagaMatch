import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) throw new Error("Variáveis do Supabase local são obrigatórias.");
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(`Teste recusado fora do ambiente local: ${host}`);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Local-${crypto.randomUUID()}-Aa1!`;
const users = [];

async function createTestUser(label) {
  const email = `lgpd-${label}-${suffix}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  users.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  return { id: data.user.id, client };
}

try {
  const first = await createTestUser("one");
  const second = await createTestUser("two");

  const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonymousProfiles = await anonymous.from("profiles").select("id");
  assert(anonymousProfiles.error, "anon não deve ter grant de leitura em profiles");

  const ownProfile = await first.client.from("profiles").select("id").single();
  assert.ifError(ownProfile.error);
  assert.equal(ownProfile.data.id, first.id);

  const otherProfiles = await second.client.from("profiles").select("id").eq("id", first.id);
  assert.ifError(otherProfiles.error);
  assert.equal(otherProfiles.data.length, 0, "RLS não pode expor perfil de outro usuário");

  const created = await first.client.from("lgpd_requests").insert({
    user_id: first.id,
    request_type: "account_deletion",
  }).select("id, user_id, status").single();
  assert.ifError(created.error);
  assert.equal(created.data.status, "pending");

  const otherRequests = await second.client.from("lgpd_requests").select("id");
  assert.ifError(otherRequests.error);
  assert.equal(otherRequests.data.length, 0, "RLS não pode expor solicitação de outro usuário");

  const spoofed = await second.client.from("lgpd_requests").insert({
    user_id: first.id,
    request_type: "account_deletion",
  });
  assert(spoofed.error, "usuário não pode criar solicitação para outro titular");

  const tampered = await first.client.from("lgpd_requests")
    .update({ request_type: "invalid" })
    .eq("id", created.data.id);
  assert(tampered.error, "campos protegidos não podem ser alterados pelo titular");

  const cancelled = await first.client.from("lgpd_requests")
    .update({ status: "cancelled" })
    .eq("id", created.data.id)
    .select("status")
    .single();
  assert.ifError(cancelled.error);
  assert.equal(cancelled.data.status, "cancelled");

  const pendingAgain = await first.client.from("lgpd_requests").insert({
    user_id: first.id,
    request_type: "account_deletion",
  }).select("id").single();
  assert.ifError(pendingAgain.error);
  const reviewed = await admin.from("lgpd_requests")
    .update({ status: "in_review" })
    .eq("id", pendingAgain.data.id);
  assert.ifError(reviewed.error);

  const cancelReview = await first.client.from("lgpd_requests")
    .update({ status: "cancelled" })
    .eq("id", pendingAgain.data.id)
    .select("id");
  assert.ifError(cancelReview.error);
  assert.equal(cancelReview.data.length, 0, "titular não pode cancelar solicitação em análise");

  const finalState = await admin.from("lgpd_requests")
    .select("status")
    .eq("id", pendingAgain.data.id)
    .single();
  assert.ifError(finalState.error);
  assert.equal(finalState.data.status, "in_review");

  const embedding = Array(768).fill(0.1);
  const curriculumVector = await admin.from("curriculos")
    .update({ embedding })
    .eq("user_id", first.id);
  assert.ifError(curriculumVector.error);
  const job = await admin.from("vagas_vistas").insert({
    user_id: first.id,
    job_id: `local-${suffix}`,
    titulo: "Vaga de teste local",
    embedding,
  }).select("id").single();
  assert.ifError(job.error);

  const similarity = await admin.rpc("match_vaga_curriculo", {
    p_user_id: first.id,
    p_vaga_id: job.data.id,
  });
  assert.ifError(similarity.error);
  assert(Math.abs(similarity.data - 1) < 0.000001, "similaridade vetorial idêntica deve ser 1");

  const feedback = await admin.rpc("ajuste_feedback_vetorial", {
    p_user_id: first.id,
    p_vaga_id: job.data.id,
  });
  assert.ifError(feedback.error);
  assert.equal(feedback.data.length, 1);

  console.log("LGPD local integration: PASS");
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
}

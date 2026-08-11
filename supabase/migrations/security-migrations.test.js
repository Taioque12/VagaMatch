import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const foundations = readFileSync(
  new URL("./022_security_scaling_foundations.sql", import.meta.url),
  "utf8",
);
const payments = readFileSync(
  new URL("./023_mercadopago_idempotency.sql", import.meta.url),
  "utf8",
);
const hardening = readFileSync(
  new URL("./024_payment_telegram_hardening.sql", import.meta.url),
  "utf8",
);
const curriculoEmbedding = readFileSync(
  new URL("../functions/curriculo-embedding/index.ts", import.meta.url),
  "utf8",
);
const mpCheckout = readFileSync(
  new URL("../functions/mp-checkout/index.ts", import.meta.url),
  "utf8",
);
const supabaseConfig = readFileSync(
  new URL("../config.toml", import.meta.url),
  "utf8",
);
const telegramLinkToken = readFileSync(
  new URL("../functions/telegram-link-token/index.ts", import.meta.url),
  "utf8",
);
const telegramWebhook = readFileSync(
  new URL("../functions/telegram-webhook/index.ts", import.meta.url),
  "utf8",
);
const stripeWebhook = readFileSync(
  new URL("../functions/stripe-webhook/index.ts", import.meta.url),
  "utf8",
);
const mpWebhook = readFileSync(
  new URL("../functions/mp-webhook/index.ts", import.meta.url),
  "utf8",
);

describe("migration 022 security contracts", () => {
  it("consome token Telegram somente quando válido e ainda não usado", () => {
    expect(foundations).toMatch(/used_at is null\s+and expires_at > now\(\)/);
    expect(foundations).toContain("pg_advisory_xact_lock");
  });

  it("mantém rate limit e lock como operações atômicas", () => {
    expect(foundations).toContain("on conflict (scope, subject_id) do update");
    expect(foundations).toContain("on conflict (lock_name) do update");
    expect(foundations).toContain("owner_id = p_owner_id");
  });

  it("bloqueia escrita direta e duplicidade de telegram_chat_id", () => {
    expect(foundations).toContain("profiles_telegram_chat_id_unique");
    expect(foundations).toContain("protect_profile_telegram_chat_id");
    expect(foundations).toContain("before insert or update on public.profiles");
    expect(foundations).toMatch(/new\.telegram_chat_id is distinct from old\.telegram_chat_id/);
  });

  it("rate-limit também protege geração de embedding de currículo", () => {
    expect(curriculoEmbedding).toContain('p_scope: "curriculo-embedding"');
    expect(curriculoEmbedding).toContain("consume_rate_limit");
    expect(curriculoEmbedding).toContain("429");
  });
});

describe("migration 023 payment contracts", () => {
  it("não trata checkout ready antigo como abandonado", () => {
    expect(payments).toMatch(/status = 'creating'\s+and public\.mp_checkout_sessions\.updated_at/);
    expect(payments).not.toMatch(/or public\.mp_checkout_sessions\.updated_at < now\(\)/);
  });

  it("vincula a reserva ao proprietário do lock", () => {
    expect(payments).toContain("request_owner_id uuid");
    expect(payments).toContain("request_owner_id = p_owner_id");
  });

  it("faz claim e finalização do webhook pelo mesmo proprietário", () => {
    expect(payments).toContain("claim_payment_webhook_event");
    expect(payments).toContain("finish_payment_webhook_event");
    expect(payments).toContain("event_id = p_event_id and owner_id = p_owner_id");
  });

  it("usa chave de idempotência persistida no checkout Mercado Pago", () => {
    expect(payments).toContain("mp_idempotency_key uuid not null default gen_random_uuid()");
    expect(payments).toContain("then public.mp_checkout_sessions.mp_idempotency_key");
    expect(mpCheckout).toContain('"X-Idempotency-Key"');
    expect(mpCheckout).toContain("checkout.mp_idempotency_key");
  });

  it("mantém o webhook do Mercado Pago sem verificação JWT no config versionado", () => {
    expect(supabaseConfig).toMatch(/\[functions\.mp-webhook\][\s\S]*verify_jwt = false/);
  });

  it("mantém o webhook Stripe sem verificação JWT no config versionado", () => {
    expect(supabaseConfig).toMatch(/\[functions\.stripe-webhook\][\s\S]*verify_jwt = false/);
  });
});

describe("migration 024 hardening contracts", () => {
  it("bloqueia embedding informado pelo cliente também na criação", () => {
    expect(hardening).toContain("before insert or update on public.curriculos");
    expect(hardening).toContain("tg_op = 'INSERT'");
  });

  it("emite tokens Telegram de forma serializada", () => {
    expect(hardening).toContain("issue_telegram_link_token");
    expect(hardening).toContain("pg_advisory_xact_lock");
    expect(telegramLinkToken).toContain("issue_telegram_link_token");
  });

  it("aceita vínculo Telegram somente em conversa privada", () => {
    expect(telegramWebhook).toContain('msg.chat?.type !== "private"');
  });

  it("processa crédito Stripe por RPC atômico", () => {
    expect(hardening).toContain("credit_referral_after_paid_subscription");
    expect(stripeWebhook).toContain("credit_referral_after_paid_subscription");
  });

  it("só aceita evento MP da assinatura esperada", () => {
    expect(mpWebhook).toContain("checkout.mp_preapproval_id !== String(dataId)");
    expect(mpWebhook).toContain("apply_mp_preapproval_status");
    expect(hardening).toContain("apply_mp_preapproval_status");
    expect(mpCheckout).toContain("eq(\"request_owner_id\", lockOwner)");
  });

  it("mantém compatibilidade de webhook MP com assinaturas legadas", () => {
    expect(mpWebhook).toContain("Assinaturas anteriores à tabela mp_checkout_sessions");
    expect(hardening).toContain("mp_preapproval_id = p_preapproval_id");
  });

  it("não reativa Stripe quando a assinatura atual não está ativa", () => {
    expect(stripeWebhook).toContain("assinaturaAtiva(subscription.status)");
    expect(stripeWebhook).toContain("invoice.payment_failed")
  });
});

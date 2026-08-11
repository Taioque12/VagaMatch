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
});

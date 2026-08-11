import { afterEach, describe, expect, it, vi } from "vitest";
import { callbackPertenceAoUsuario, validarRequisicaoWebhookTelegram } from "./auth.ts";

const SECRET = "telegram-webhook-test-secret";

function requisicao(method = "POST", token) {
  const headers = new Headers();
  if (token !== undefined) headers.set("X-Telegram-Bot-Api-Secret-Token", token);
  return new Request("https://example.test/telegram-webhook", { method, headers });
}

afterEach(() => vi.restoreAllMocks());

describe("validação do webhook Telegram", () => {
  it("rejeita update quando TELEGRAM_WEBHOOK_SECRET está ausente", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const resposta = validarRequisicaoWebhookTelegram(requisicao(), undefined);

    expect(resposta?.status).toBe(503);
    expect(erro).toHaveBeenCalledWith("TELEGRAM_WEBHOOK_SECRET não configurado; update rejeitado.");
  });

  it("rejeita update sem header do Telegram", () => {
    expect(validarRequisicaoWebhookTelegram(requisicao(), SECRET)?.status).toBe(401);
  });

  it("rejeita update com secret incorreto", () => {
    expect(validarRequisicaoWebhookTelegram(requisicao("POST", "incorreto"), SECRET)?.status).toBe(401);
  });

  it("aceita update somente com secret correto", () => {
    expect(validarRequisicaoWebhookTelegram(requisicao("POST", SECRET), SECRET)).toBeNull();
  });

  it("mantém rejeição de métodos diferentes de POST", () => {
    expect(validarRequisicaoWebhookTelegram(requisicao("GET", SECRET), SECRET)?.status).toBe(405);
  });

  it("nega callback de outro usuário, inclusive para gerar PDF ou iniciar entrevista", () => {
    expect(callbackPertenceAoUsuario({ fromId: "100", chatId: "100", perfilId: "user-a", vagaUserId: "user-b" })).toBe(false);
  });

  it("nega callback de grupo ou chat divergente", () => {
    expect(callbackPertenceAoUsuario({ fromId: "100", chatId: "-200", perfilId: "user-a", vagaUserId: "user-a" })).toBe(false);
  });

  it("autoriza somente o proprietário no chat privado vinculado", () => {
    expect(callbackPertenceAoUsuario({ fromId: "100", chatId: "100", perfilId: "user-a", vagaUserId: "user-a" })).toBe(true);
  });
});

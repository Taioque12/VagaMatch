import { afterEach, describe, expect, it, vi } from "vitest";
import { protegerWebhookTelegram } from "./auth.ts";

function requisicao(method = "POST", token) {
  const headers = new Headers();
  if (token !== undefined) headers.set("X-Telegram-Bot-Api-Secret-Token", token);
  return new Request("https://example.test/telegram-webhook", { method, headers });
}

function criarHandler() {
  return vi.fn(async () => new Response("OK", { status: 200 }));
}

afterEach(() => vi.restoreAllMocks());

describe("autenticação fail-closed do webhook Telegram", () => {
  it.each([undefined, ""])("rejeita com 503 quando o secret é %p", async (secret) => {
    const handler = criarHandler();
    const resposta = await protegerWebhookTelegram(secret, handler)(requisicao());

    expect(resposta.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejeita com 401 sem header e não chama o handler", async () => {
    const handler = criarHandler();
    const resposta = await protegerWebhookTelegram("segredo-de-teste", handler)(requisicao());

    expect(resposta.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejeita com 401 quando o header é inválido e não chama o handler", async () => {
    const handler = criarHandler();
    const resposta = await protegerWebhookTelegram("segredo-de-teste", handler)(requisicao("POST", "incorreto"));

    expect(resposta.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("autoriza header válido e chama o handler", async () => {
    const handler = criarHandler();
    const resposta = await protegerWebhookTelegram("segredo-de-teste", handler)(
      requisicao("POST", "segredo-de-teste"),
    );

    expect(resposta.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("mantém 405 para método diferente de POST sem chamar o handler", async () => {
    const handler = criarHandler();
    const resposta = await protegerWebhookTelegram("segredo-de-teste", handler)(requisicao("GET"));

    expect(resposta.status).toBe(405);
    expect(handler).not.toHaveBeenCalled();
  });
});

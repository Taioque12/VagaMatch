import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({
  env: { telegramBotToken: "fake-token" },
}));

import { isTelegramBlockedError, notificarVaga } from "./telegram.js";

describe("Telegram errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifica o 403 bot blocked como falha permanente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        ok: false,
        error_code: 403,
        description: "Forbidden: bot was blocked by the user",
      }),
    }));

    const vaga = {
      callback_id: "cb-1",
      titulo: "Dev",
      empresa: "Acme",
      local: "Remoto",
      score: 80,
      url: "https://example.com/vaga",
    };

    const erro = await notificarVaga("123", vaga).catch((error) => error);

    expect(isTelegramBlockedError(erro)).toBe(true);
    expect(erro).toMatchObject({ telegramErrorCode: 403, isTelegramBlocked: true });
  });
});

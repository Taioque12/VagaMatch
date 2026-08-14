import { describe, expect, it, vi } from "vitest";
import { isTransientSupabaseError, withSupabaseRetry } from "./supabase-retry.js";

describe("isTransientSupabaseError", () => {
  it("reconhece reset de conexão do gateway", () => {
    expect(isTransientSupabaseError({
      message: "upstream connect error or disconnect/reset before headers: delayed connect error: 111",
    })).toBe(true);
  });

  it("reconhece status HTTP transitórios", () => {
    expect(isTransientSupabaseError({ status: 503, message: "temporarily unavailable" })).toBe(true);
  });

  it("não repete erros de autenticação", () => {
    expect(isTransientSupabaseError({ status: 401, message: "JWT rejected" })).toBe(false);
    expect(isTransientSupabaseError({ message: "Invalid API key" })).toBe(false);
  });
});

describe("withSupabaseRetry", () => {
  it("repete falhas transitórias com backoff até obter sucesso", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    const logger = { warn: vi.fn() };

    await expect(withSupabaseRetry(operation, {
      label: "Supabase RPC (acquire lock)",
      maxAttempts: 4,
      baseDelayMs: 100,
      sleep,
      logger,
    })).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("falha imediatamente em erro de autenticação", async () => {
    const authError = Object.assign(new Error("JWT rejected"), { status: 401 });
    const operation = vi.fn().mockRejectedValue(authError);
    const sleep = vi.fn();

    await expect(withSupabaseRetry(operation, {
      label: "Supabase RPC (acquire lock)",
      sleep,
      logger: { warn: vi.fn() },
    })).rejects.toThrow("Supabase RPC (acquire lock): JWT rejected");

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("encerra após o limite de tentativas", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("gateway timeout"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withSupabaseRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 50,
      sleep,
      logger: { warn: vi.fn() },
    })).rejects.toThrow("Supabase: gateway timeout");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[50], [100]]);
  });
});

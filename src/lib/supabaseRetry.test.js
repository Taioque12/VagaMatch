import { describe, expect, it, vi } from "vitest";
import {
  ehJwtEmitidoNoFuturo,
  executarComRetryJwtFuturo,
  mensagemErroCarregamento,
} from "./supabaseRetry.js";

describe("resiliência a clock skew do JWT", () => {
  it("repete uma única vez quando o token foi emitido no futuro", async () => {
    const operacao = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "JWT issued at future" } })
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null });
    const aguardar = vi.fn().mockResolvedValue(undefined);

    const resultado = await executarComRetryJwtFuturo(operacao, aguardar);

    expect(resultado).toEqual({ data: [{ id: 1 }], error: null });
    expect(operacao).toHaveBeenCalledTimes(2);
    expect(aguardar).toHaveBeenCalledWith(2_000);
  });

  it("não repete erros que não sejam de clock skew", async () => {
    const resposta = { data: null, error: { message: "permission denied" } };
    const operacao = vi.fn().mockResolvedValue(resposta);
    const aguardar = vi.fn();

    expect(await executarComRetryJwtFuturo(operacao, aguardar)).toBe(resposta);
    expect(operacao).toHaveBeenCalledTimes(1);
    expect(aguardar).not.toHaveBeenCalled();
  });

  it("não expõe a mensagem técnica ao usuário", () => {
    const error = { message: "JWT issued at future" };
    expect(ehJwtEmitidoNoFuturo(error)).toBe(true);
    expect(mensagemErroCarregamento(error)).not.toContain(error.message);
  });
});

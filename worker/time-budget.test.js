import { describe, expect, it } from "vitest";
import { criarOrcamentoTempo } from "./time-budget.js";

describe("criarOrcamentoTempo", () => {
  it("interrompe exatamente ao atingir o limite", () => {
    let agora = 1000;
    const orcamento = criarOrcamentoTempo(600, () => agora);

    expect(orcamento.deveInterromper()).toBe(false);
    expect(orcamento.restanteMs()).toBe(600);

    agora = 1600;
    expect(orcamento.deveInterromper()).toBe(true);
    expect(orcamento.restanteMs()).toBe(0);
  });

  it("rejeita duração inválida", () => {
    expect(() => criarOrcamentoTempo(0)).toThrow("número positivo");
  });
});

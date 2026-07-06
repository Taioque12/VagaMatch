import { describe, expect, it } from "vitest";
import { escapeMd, legendaVaga } from "./telegram.js";

describe("escapeMd", () => {
  it("escapa os 4 caracteres especiais do Markdown legado do Telegram", () => {
    expect(escapeMd("Dev *URGENTE* [SP] _remoto_ `js`")).toBe(
      "Dev \\*URGENTE\\* \\[SP] \\_remoto\\_ \\`js\\`"
    );
  });

  it("não altera texto sem caracteres especiais", () => {
    expect(escapeMd("Analista de Dados Pleno")).toBe("Analista de Dados Pleno");
  });

  it("tolera null/undefined sem lançar", () => {
    expect(escapeMd(null)).toBe("");
    expect(escapeMd(undefined)).toBe("");
  });
});

describe("legendaVaga", () => {
  const vaga = {
    titulo: "Dev Back-end *URGENTE*",
    empresa: "Tech_Corp",
    local: "São Paulo, SP",
    url: "https://example.com/vagas/dev_backend_123",
    score: 50,
    salario_min: 6000,
    salario_max: 9000,
  };

  it("escapa os campos dinâmicos mas preserva o bold da moldura no título", () => {
    const legenda = legendaVaga(vaga, ["node.js", "sql"]);
    expect(legenda).toContain("💼 *Dev Back-end \\*URGENTE\\**");
    expect(legenda).toContain("🏢 Tech\\_Corp — São Paulo, SP");
    expect(legenda).toContain("🔗 https://example.com/vagas/dev\\_backend\\_123");
  });

  it("omite a linha de salário quando salario_min é nulo", () => {
    const legenda = legendaVaga({ ...vaga, salario_min: null }, []);
    expect(legenda).not.toContain("💰");
  });

  it("inclui a faixa salarial arredondada quando presente", () => {
    const legenda = legendaVaga(vaga, []);
    expect(legenda).toContain("💰 R$ 6000–9000");
  });
});

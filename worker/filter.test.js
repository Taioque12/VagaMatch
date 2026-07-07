import { describe, expect, it } from "vitest";
import { filtrarRelevantes, ordenarPorScore } from "./filter.js";

const vaga = (overrides) => ({
  job_id: "1",
  titulo: "",
  descricao: "",
  salario_min: null,
  salario_max: null,
  ...overrides,
});

describe("filtrarRelevantes", () => {
  it("exclui vagas com menos de 2 palavras-chave batendo (default minMatches=2)", () => {
    const vagas = [vaga({ job_id: "1", titulo: "Dev Node.js", descricao: "vaga sem mais nada" })];
    expect(filtrarRelevantes(vagas, ["node.js", "sql", "python"])).toHaveLength(0);
  });

  it("inclui vagas com 2+ palavras-chave batendo", () => {
    const vagas = [
      vaga({ job_id: "1", titulo: "Dev Backend", descricao: "Node.js e SQL avançado" }),
    ];
    const relevantes = filtrarRelevantes(vagas, ["node.js", "sql", "python"]);
    expect(relevantes).toHaveLength(1);
    expect(relevantes[0].matches).toEqual(["node.js", "sql"]);
  });

  it("ignora acentuação e caixa ao comparar (normaliza NFD)", () => {
    const vagas = [vaga({ job_id: "1", titulo: "Análise de dados", descricao: "SQL e Python" })];
    const relevantes = filtrarRelevantes(vagas, ["analise", "sql"]);
    expect(relevantes).toHaveLength(1);
  });

  it("respeita minMatches customizado", () => {
    const vagas = [vaga({ job_id: "1", titulo: "Dev Node.js", descricao: "" })];
    expect(filtrarRelevantes(vagas, ["node.js"], 1)).toHaveLength(1);
  });
});

describe("ordenarPorScore", () => {
  it("pontua 10 por match e ordena da maior pra menor pontuação", () => {
    const vagas = [
      { ...vaga({ job_id: "1" }), matches: ["a"] },
      { ...vaga({ job_id: "2" }), matches: ["a", "b", "c"] },
    ];
    const pontuadas = ordenarPorScore(vagas);
    expect(pontuadas.map((v) => v.job_id)).toEqual(["2", "1"]);
    expect(pontuadas[0].score).toBe(30);
    expect(pontuadas[1].score).toBe(10);
  });

  it("soma bônus de salário acima/muito acima da mediana", () => {
    const acimaMediana = {
      ...vaga({ job_id: "1", salario_min: 5000 }),
      matches: [],
    };
    const bemAcimaMediana = {
      ...vaga({ job_id: "2", salario_min: 5000, salario_max: 8000 }),
      matches: [],
    };
    const [semBonus] = ordenarPorScore([acimaMediana]);
    const [comBonusDuplo] = ordenarPorScore([bemAcimaMediana]);
    expect(semBonus.score).toBe(20); // salario_min >= 4850
    expect(comBonusDuplo.score).toBe(30); // + salario_max >= 4850*1.3
  });

  it("não muta o array original", () => {
    const original = [{ ...vaga({ job_id: "1" }), matches: ["a"] }];
    const copia = [...original];
    ordenarPorScore(original);
    expect(original).toEqual(copia);
  });
});

import { describe, expect, it } from "vitest";
import { textoDoCurriculo } from "./embeddings.js";

describe("textoDoCurriculo", () => {
  it("consolida somente os dados persistidos do currículo", () => {
    const texto = textoDoCurriculo({
      resumo_profissional: "Desenvolvedor backend",
      habilidades: ["Node.js", "PostgreSQL"],
      experiencias: [{ cargo: "Dev", empresa: "Acme", bullets: ["Criou APIs"] }],
      formacao: ["Sistemas de Informação"],
      cursos: [],
      projetos: [],
    });

    expect(texto).toContain("Desenvolvedor backend");
    expect(texto).toContain("Dev | Acme | Criou APIs");
    expect(texto).toContain("PostgreSQL");
  });

  it("aceita currículo vazio sem inventar conteúdo", () => {
    expect(textoDoCurriculo({})).toBe("");
  });
});

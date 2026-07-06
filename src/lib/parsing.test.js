import { describe, expect, it } from "vitest";
import { csv, linhas } from "./parsing.js";

describe("linhas", () => {
  it("separa por quebra de linha real, ignorando linhas vazias e espaços", () => {
    expect(linhas("Bullet 1\nBullet 2\n\n  Bullet 3  \n")).toEqual([
      "Bullet 1",
      "Bullet 2",
      "Bullet 3",
    ]);
  });

  it("não separa \\n literal (barra invertida + n) — regressão do bug de import de PDF", () => {
    expect(linhas("Bullet 1\\nBullet 2")).toEqual(["Bullet 1\\nBullet 2"]);
  });

  it("retorna array vazio pra texto vazio", () => {
    expect(linhas("")).toEqual([]);
  });
});

describe("csv", () => {
  it("separa por vírgula, ignorando espaços e itens vazios", () => {
    expect(csv("node.js,  sql , python,,")).toEqual(["node.js", "sql", "python"]);
  });

  it("retorna array vazio pra texto vazio", () => {
    expect(csv("")).toEqual([]);
  });
});

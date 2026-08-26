import { describe, expect, it } from "vitest";
import { obterDestinoMfaSeguro, possuiMfaVerificado, precisaDesafioMfa } from "./mfa.js";

describe("política de MFA", () => {
  it("exige desafio somente ao promover uma sessão aal1 para aal2", () => {
    expect(precisaDesafioMfa({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
    expect(precisaDesafioMfa({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
    expect(precisaDesafioMfa({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
  });

  it("reconhece apenas fatores TOTP verificados", () => {
    expect(possuiMfaVerificado({ totp: [{ status: "verified" }] })).toBe(true);
    expect(possuiMfaVerificado({ totp: [{ status: "unverified" }] })).toBe(false);
    expect(possuiMfaVerificado({ totp: [] })).toBe(false);
  });

  it("aceita somente destinos internos seguros", () => {
    expect(obterDestinoMfaSeguro("/admin?aba=usuarios")).toBe("/admin?aba=usuarios");
    expect(obterDestinoMfaSeguro("https://malicioso.example")).toBe("/dashboard");
    expect(obterDestinoMfaSeguro("//malicioso.example")).toBe("/dashboard");
    expect(obterDestinoMfaSeguro("/mfa")).toBe("/dashboard");
  });
});

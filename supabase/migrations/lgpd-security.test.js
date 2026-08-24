import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lgpdMigration = readFileSync(new URL("./026_lgpd_requests_and_least_privilege.sql", import.meta.url), "utf8");
const vectorMigration = readFileSync(new URL("./027_move_vector_to_extensions.sql", import.meta.url), "utf8");
const vectorRollback = readFileSync(new URL("./rollback/027_move_vector_to_public.sql", import.meta.url), "utf8");
const rightsFunction = readFileSync(new URL("../functions/lgpd-rights/index.ts", import.meta.url), "utf8");
const supabaseConfig = readFileSync(new URL("../config.toml", import.meta.url), "utf8");
const loginPage = readFileSync(new URL("../../src/pages/Login.jsx", import.meta.url), "utf8");
const signupPage = readFileSync(new URL("../../src/pages/Cadastro.jsx", import.meta.url), "utf8");

describe("LGPD authorization contracts", () => {
  it("isola solicitacoes por usuario e protege transicoes", () => {
    expect(lgpdMigration).toContain("auth.uid() = user_id");
    expect(lgpdMigration).toContain("new.status <> 'cancelled'");
    expect(lgpdMigration).toContain("revoke all on function public.protect_lgpd_request_transition()");
  });

  it("remove grants anonimos e concede apenas operacoes usadas pelo cliente", () => {
    expect(lgpdMigration).toContain("revoke all on all tables in schema public from anon");
    expect(lgpdMigration).toContain("grant select, update on public.vagas_vistas to authenticated");
    expect(lgpdMigration).not.toContain("grant all on public.vagas_vistas to authenticated");
  });

  it("valida o JWT e limita operacoes sensiveis", () => {
    expect(rightsFunction).toContain("auth.getUser()");
    expect(rightsFunction).toContain('p_scope: `lgpd-rights:${body.action ?? "unknown"}`');
    expect(rightsFunction).toContain('.eq("user_id", userId)');
    expect(rightsFunction).not.toContain("deleteUser");
    expect(supabaseConfig).toMatch(/\[functions\.lgpd-rights\][\s\S]*verify_jwt = true/);
  });

  it("nao mostra mensagens cruas do provedor na autenticacao", () => {
    expect(loginPage).not.toContain("setErro(error.message)");
    expect(signupPage).not.toContain("setErro(error.message)");
    expect(loginPage).toContain("E-mail ou senha incorretos.");
  });
});

describe("pgvector relocation contracts", () => {
  it("move a extensao sem remover dados e oferece rollback", () => {
    expect(vectorMigration).toContain("alter extension vector set schema extensions");
    expect(vectorMigration).not.toMatch(/drop\s+extension/i);
    expect(vectorMigration).toContain("alter function public.protect_curriculo_system_columns()\n  set search_path = public, extensions");
    expect(vectorMigration).toContain("alter function public.protect_vaga_privileged_columns()\n  set search_path = public, extensions");
    expect(vectorMigration).toContain("alter function public.match_vaga_curriculo(uuid, uuid)\n  set search_path = public, extensions");
    expect(vectorMigration).toContain("alter function public.ajuste_feedback_vetorial(uuid, uuid)\n  set search_path = public, extensions");
    expect(vectorRollback).toContain("alter extension vector set schema public");
    expect(vectorRollback).toContain("set search_path = public");
  });
});

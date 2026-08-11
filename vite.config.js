import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Os testes Deno existentes continuam fora do Vitest; o teste unitário da
    // autenticação do webhook é compatível com Vitest e deve rodar no CI local.
    exclude: ["**/node_modules/**", "supabase/functions/**/index.test.ts"],
    // Zera a janela de rate-limit do Gemini nos testes do worker — precisa
    // estar aqui (não no test file): imports ESM são hoisted e o módulo lê a
    // env na carga, antes de qualquer linha do teste rodar.
    env: { GEMINI_MIN_INTERVAL_MS: "0" },
  },
});

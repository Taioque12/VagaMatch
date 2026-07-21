import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["**/node_modules/**", "supabase/functions/**"],
    // Zera a janela de rate-limit do Gemini nos testes do worker — precisa
    // estar aqui (não no test file): imports ESM são hoisted e o módulo lê a
    // env na carga, antes de qualquer linha do teste rodar.
    env: { GEMINI_MIN_INTERVAL_MS: "0" },
  },
});

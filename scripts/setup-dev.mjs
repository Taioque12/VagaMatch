// Setup das ferramentas de IA num PC novo: npm run setup:ia
// Idempotente — instala só o que falta e NUNCA sobrescreve a config versionada
// no git (CLAUDE.md, .claude/, .mcp.json, .claude-flow/config.yaml).
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const run = (cmd) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true });
};

// 1. claude-mem — memória persistente entre sessões do Claude Code (dados em ~/.claude-mem)
if (!existsSync(join(homedir(), ".claude-mem"))) {
  run("npx claude-mem install");
} else {
  console.log("✓ claude-mem já instalado (~/.claude-mem existe)");
}
try {
  run("npx claude-mem start");
} catch {
  console.warn("⚠ claude-mem start falhou (worker pode já estar rodando) — siga em frente.");
}

// 2. ruflo — orquestração de agentes. A config (.claude/, CLAUDE.md, .mcp.json) já vem
// do git; o init só roda se o runtime local nunca foi criado, senão ele sobrescreveria
// os padrões versionados do projeto.
if (!existsSync(".claude-flow")) {
  run("npx ruflo@latest init");
} else {
  console.log("✓ ruflo já inicializado (.claude-flow/ existe) — config do git preservada");
}

console.log("\n✅ Setup de IA concluído. Abra o Claude Code que os hooks/skills já valem.");

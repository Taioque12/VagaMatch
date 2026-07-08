import { env } from "./config.js";

// Busca vagas via Jooble — agregador global com boa cobertura no Brasil.
// Opcional: se JOOBLE_API_KEY não estiver setada, retorna lista vazia sem erro.
export async function buscarVagasJooble({ termo, regiao }) {
  if (!env.joobleApiKey) return [];

  const url = `https://jooble.org/api/${env.joobleApiKey}`;
  const body = {
    keywords: termo,
    location: regiao ? `${regiao}, Brasil` : "Brasil",
    page: 1,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const corpo = (await res.text()).slice(0, 200);
    throw new Error(`Jooble ${res.status}: ${corpo}`);
  }
  const data = await res.json();
  return (data.jobs ?? []).map((r) => ({
    job_id: `jooble_${r.id || r.link?.slice(-20)?.replace(/\W/g, "")}`,
    titulo: r.title ?? "",
    empresa: r.company ?? "Não informada",
    local: r.location ?? "",
    descricao: r.snippet ?? "",
    url: r.link ?? "",
    salario_min: r.salary ? parseFloat(r.salary) || null : null,
    salario_max: null,
    fonte: "Jooble",
  }));
}

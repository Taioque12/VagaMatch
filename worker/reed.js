import { env } from "./config.js";

// Busca vagas via Reed.co.uk — foco em UK, útil para vagas internacionais/remotas.
// Opcional: se REED_API_KEY não estiver setada, retorna lista vazia sem erro.
export async function buscarVagasReed({ termo, regiao }) {
  if (!env.reedApiKey) return [];

  const url = new URL("https://www.reed.co.uk/api/1.0/search");
  url.searchParams.set("keywords", termo);
  if (regiao) url.searchParams.set("locationName", regiao);
  url.searchParams.set("resultsToTake", "25");

  // Reed usa Basic Auth: API key como username, senha vazia
  const auth = Buffer.from(`${env.reedApiKey}:`).toString("base64");

  const res = await fetch(url, {
    headers: {
      "Authorization": `Basic ${auth}`,
    },
  });
  if (!res.ok) {
    const corpo = (await res.text()).slice(0, 200);
    throw new Error(`Reed ${res.status}: ${corpo}`);
  }
  const data = await res.json();
  return (data.results ?? []).map((r) => ({
    job_id: `reed_${r.jobId}`,
    titulo: r.jobTitle,
    empresa: r.employerName ?? "Não informada",
    local: r.locationName ?? "",
    descricao: r.jobDescription ?? "",
    url: r.jobUrl ?? "",
    salario_min: r.minimumSalary ?? null,
    salario_max: r.maximumSalary ?? null,
    fonte: "Reed",
  }));
}

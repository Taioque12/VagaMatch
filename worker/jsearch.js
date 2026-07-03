import { env } from "./config.js";

// Busca vagas via JSearch (RapidAPI) — agrega Indeed/LinkedIn/Glassdoor.
// Opcional: se RAPIDAPI_KEY não estiver setada, retorna lista vazia sem erro.
export async function buscarVagasJSearch({ termo, regiao }) {
  if (!env.rapidapiKey) return [];

  const query = regiao ? `${termo} em ${regiao}, Brasil` : `${termo}, Brasil`;
  const url = new URL("https://jsearch.p.rapidapi.com/search");
  url.searchParams.set("query", query);
  url.searchParams.set("country", "br");
  url.searchParams.set("num_pages", "1");

  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": env.rapidapiKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  });
  if (!res.ok) {
    throw new Error(`JSearch ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.data ?? []).map((r) => ({
    job_id: `jsearch_${r.job_id}`,
    titulo: r.job_title,
    empresa: r.employer_name ?? "Não informada",
    local: [r.job_city, r.job_state].filter(Boolean).join(", "),
    descricao: r.job_description ?? "",
    url: r.job_apply_link ?? r.job_google_link ?? "",
    salario_min: r.job_min_salary ?? null,
    salario_max: r.job_max_salary ?? null,
    fonte: "JSearch",
  }));
}

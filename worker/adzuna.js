import { env } from "./config.js";

// Busca vagas na Adzuna (país: BR). Docs: https://developer.adzuna.com/docs/search
export async function buscarVagas({ termo, regiao, raioKm }) {
  const url = new URL("https://api.adzuna.com/v1/api/jobs/br/search/1");
  url.searchParams.set("app_id", env.adzunaAppId);
  url.searchParams.set("app_key", env.adzunaAppKey);
  url.searchParams.set("what", termo);
  if (regiao) {
    url.searchParams.set("where", regiao);
    if (raioKm) url.searchParams.set("distance", String(raioKm));
  }
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("content-type", "application/json");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Adzuna ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.results ?? []).map((r) => ({
    job_id: String(r.id),
    titulo: r.title,
    empresa: r.company?.display_name ?? "Não informada",
    local: r.location?.display_name ?? "",
    descricao: r.description ?? "",
    url: r.redirect_url,
    salario_min: r.salary_min ?? null,
    salario_max: r.salary_max ?? null,
    fonte: "Adzuna",
  }));
}

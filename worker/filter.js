import { MEDIANA_SALARIAL } from "./config.js";

const normalizar = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Relevante se título+descrição contêm >= minMatches palavras-chave (do usuário) distintas.
export function filtrarRelevantes(vagas, palavrasChave, minMatches = 1) {
  const chavesNorm = palavrasChave.map(normalizar);
  return vagas
    .map((v) => {
      const texto = normalizar(`${v.titulo} ${v.descricao}`);
      const matches = [...new Set(chavesNorm.filter((k) => texto.includes(k)))];
      return { ...v, matches };
    })
    .filter((v) => v.matches.length >= minMatches);
}

function pontuarVaga(vaga) {
  let score = vaga.matches.length * 10;
  if (vaga.salario_min && vaga.salario_min >= MEDIANA_SALARIAL) score += 20;
  if (vaga.salario_max && vaga.salario_max >= MEDIANA_SALARIAL * 1.3) score += 10;
  return score;
}

export function ordenarPorScore(vagas) {
  return [...vagas]
    .map((v) => ({ ...v, score: pontuarVaga(v) }))
    .sort((a, b) => b.score - a.score);
}

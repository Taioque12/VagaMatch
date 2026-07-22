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

// Sinônimos por modalidade — cobre PT-BR e termos comuns em vagas técnicas (EN).
// "hibrido" cobre "hibrido" e "hybrid" após normalizar (sem acento).
const TERMOS_MODALIDADE = {
  remoto: ["remoto", "remote", "home office", "trabalho remoto", "100% remoto", "anywhere"],
  hibrido: ["hibrido", "hybrid"],
  presencial: ["presencial", "on-site", "onsite", "in office", "in-office"],
};

// Filtra vagas por modalidade de trabalho (busca em título+local+descrição).
// 'qualquer' não filtra nada — comportamento atual preservado.
// Vaga sem menção explícita de modalidade passa (fail-open: melhor mostrar
// vaga ambígua do que esconder vaga boa por falta de informação no anúncio).
export function filtrarPorModalidade(vagas, modalidade) {
  if (!modalidade || modalidade === "qualquer") return vagas;

  const termosDesejados = TERMOS_MODALIDADE[modalidade] ?? [];
  const todosOsTermos = Object.values(TERMOS_MODALIDADE).flat();

  return vagas.filter((v) => {
    const texto = normalizar(`${v.titulo} ${v.local || ""} ${v.descricao || ""}`);
    const mencionaDesejada = termosDesejados.some((t) => texto.includes(t));
    if (mencionaDesejada) return true;

    const mencionaOutraModalidade = todosOsTermos
      .filter((t) => !termosDesejados.includes(t))
      .some((t) => texto.includes(t));
    // Sem menção nenhuma → passa (fail-open); menciona outra modalidade → filtra fora.
    return !mencionaOutraModalidade;
  });
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

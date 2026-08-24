export const CANDIDATURA_LABEL = "Marcar que me candidatei";

const STATUS_LABEL = {
  descoberta: "Descoberta",
  pendente_processamento: "Em processamento",
  notificada: "Notificada",
  candidatado: "Candidatura registrada",
  descartada: "Descartada",
  erro: "Erro no processamento",
};

export function obterRotuloStatus(status) {
  return STATUS_LABEL[status] ?? "Status indisponível";
}

export function criarPatchStatusVaga(novoStatus, agora = new Date()) {
  return ["candidatado", "descartada"].includes(novoStatus)
    ? { status: novoStatus, feedback_em: agora.toISOString() }
    : { status: novoStatus };
}

export function estadoInicialFiltros() {
  return {
    filtro: "todas",
    soHomeOffice: false,
    periodo: "tudo",
  };
}

export function temFiltrosAtivos({ filtro, soHomeOffice, periodo }) {
  return filtro !== "todas" || soHomeOffice || periodo !== "tudo";
}

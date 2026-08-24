export function criarPreferenciasParaSalvar(userId, dados = {}, ativoAtual) {
  return {
    user_id: userId,
    ativo: ativoAtual ?? true,
    cargos_alvo: dados.cargos_alvo || [],
    palavras_chave: dados.palavras_chave || [],
    regioes: dados.regioes || [],
    modalidade_trabalho: dados.modalidade_trabalho || "qualquer",
    busca_solicitada: true,
    updated_at: new Date().toISOString(),
  };
}

export function deveConfirmarSaida(temAlteracoesNaoSalvas, destino) {
  return Boolean(temAlteracoesNaoSalvas) && destino !== "/onboarding";
}

export function deveExibirSucessoPerfil(salvo, temAlteracoesNaoSalvas) {
  return Boolean(salvo) && !temAlteracoesNaoSalvas;
}

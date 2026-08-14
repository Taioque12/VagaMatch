export function criarOrcamentoTempo(maxRuntimeMs, now = () => Date.now()) {
  if (!Number.isFinite(maxRuntimeMs) || maxRuntimeMs <= 0) {
    throw new Error("O orçamento de tempo do worker deve ser um número positivo.");
  }

  const inicio = now();
  const limite = inicio + maxRuntimeMs;

  return {
    inicio,
    limite,
    deveInterromper: () => now() >= limite,
    restanteMs: () => Math.max(0, limite - now()),
  };
}

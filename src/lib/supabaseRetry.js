const JWT_FUTURO = "jwt issued at future";

export function ehJwtEmitidoNoFuturo(error) {
  return typeof error?.message === "string"
    && error.message.toLowerCase().includes(JWT_FUTURO);
}

export async function executarComRetryJwtFuturo(
  operacao,
  aguardar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const primeiraTentativa = await operacao();
  if (!ehJwtEmitidoNoFuturo(primeiraTentativa.error)) return primeiraTentativa;

  await aguardar(2_000);
  return operacao();
}

export function mensagemErroCarregamento(error) {
  if (ehJwtEmitidoNoFuturo(error)) {
    return "Sua sessão ainda está sendo sincronizada. Recarregue a página em alguns segundos.";
  }
  return "Não foi possível carregar suas oportunidades. Tente novamente.";
}

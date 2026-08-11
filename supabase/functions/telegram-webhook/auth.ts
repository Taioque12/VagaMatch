const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

// Retorna uma Response de rejeição ou null quando a requisição pode seguir.
// Esta validação não lê o body e deve acontecer antes de qualquer efeito colateral.
export function validarRequisicaoWebhookTelegram(
  req: Request,
  webhookSecret: string | undefined,
): Response | null {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!webhookSecret) {
    console.error("TELEGRAM_WEBHOOK_SECRET não configurado; update rejeitado.");
    return new Response("Webhook configuration error", { status: 503 });
  }

  const token = req.headers.get(TELEGRAM_SECRET_HEADER);
  if (token !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

export function callbackPertenceAoUsuario({
  fromId,
  chatId,
  perfilId,
  vagaUserId,
}: {
  fromId: string | number;
  chatId: string | number | undefined;
  perfilId: string | undefined;
  vagaUserId: string | undefined;
}) {
  return Boolean(
    chatId &&
    String(fromId) === String(chatId) &&
    perfilId &&
    vagaUserId &&
    perfilId === vagaUserId,
  );
}

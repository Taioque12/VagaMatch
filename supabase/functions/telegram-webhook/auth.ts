const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

type WebhookHandler = (req: Request) => Response | Promise<Response>;

// Retorna uma resposta de rejeição ou null. Não lê o body e não executa handlers.
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

  if (req.headers.get(TELEGRAM_SECRET_HEADER) !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

// Mantém a validação antes de qualquer parse ou efeito colateral do update.
export function protegerWebhookTelegram(webhookSecret: string | undefined, handler: WebhookHandler) {
  return async (req: Request): Promise<Response> => {
    const rejeicao = validarRequisicaoWebhookTelegram(req, webhookSecret);
    if (rejeicao) return rejeicao;
    return handler(req);
  };
}

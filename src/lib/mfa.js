export function obterDestinoMfaSeguro(from, fallback = "/dashboard") {
  const destino = typeof from === "string"
    ? from
    : typeof from?.pathname === "string"
      ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`
      : fallback;

  if (!destino.startsWith("/") || destino.startsWith("//") || destino.includes("\\")) {
    return fallback;
  }

  try {
    const origin = globalThis.location?.origin ?? "https://vagamatch.local";
    const url = new URL(destino, origin);
    if (url.origin !== origin || ["/login", "/mfa"].includes(url.pathname)) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function precisaDesafioMfa(aal) {
  return aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
}

export function possuiMfaVerificado(factors) {
  return Array.isArray(factors?.totp) && factors.totp.some((factor) => factor.status === "verified");
}

export function normalizarEnrollmentMfa(data) {
  const factorId = typeof data?.id === "string" ? data.id : "";
  const qrCode = typeof data?.totp?.qr_code === "string" ? data.totp.qr_code : "";
  const secret = typeof data?.totp?.secret === "string" ? data.totp.secret : "";

  if (!factorId || (!qrCode && !secret)) {
    throw new Error("Resposta de cadastro MFA incompleta.");
  }

  return { factorId, qrCode, secret };
}

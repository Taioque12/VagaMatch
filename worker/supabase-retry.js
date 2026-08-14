const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_AUTH_PATTERNS = [
  "401",
  "403",
  "invalid api key",
  "invalid jwt",
  "jwt expired",
  "jwt rejection",
  "unauthorized",
  "forbidden",
];
const RETRYABLE_ERROR_PATTERNS = [
  "upstream connect error",
  "connection reset",
  "connection refused",
  "delayed connect error",
  "fetch failed",
  "network error",
  "socket hang up",
  "econnreset",
  "econnrefused",
  "etimedout",
  "timeout",
  "timed out",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
];

function errorText(error) {
  return [error?.message, error?.code, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isTransientSupabaseError(error) {
  const status = Number(error?.status ?? error?.statusCode);
  const text = errorText(error);

  if (status === 401 || status === 403) return false;
  if (NON_RETRYABLE_AUTH_PATTERNS.some((pattern) => text.includes(pattern))) return false;
  if (RETRYABLE_STATUS_CODES.has(status)) return true;

  return RETRYABLE_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSupabaseRetry(operation, {
  label = "Supabase",
  maxAttempts = 4,
  baseDelayMs = 1000,
  sleep = wait,
  logger = console,
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < maxAttempts && isTransientSupabaseError(error);
      if (!shouldRetry) break;

      const delayMs = baseDelayMs * (2 ** (attempt - 1));
      logger.warn(`${label}: falha transitória (${attempt}/${maxAttempts}); nova tentativa em ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  const message = lastError?.message || String(lastError || "erro desconhecido");
  const wrapped = new Error(`${label}: ${message}`, { cause: lastError });
  if (lastError?.status != null) wrapped.status = lastError.status;
  if (lastError?.code != null) wrapped.code = lastError.code;
  throw wrapped;
}

export type FallbackReason = "rate_limit" | "upstream_error" | "timeout";

export function fallbackReason(status: number): FallbackReason | null {
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream_error";
  return null;
}

export function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function textContents(contents: unknown): string | null {
  if (typeof contents === "string") return contents.trim() || null;
  if (!Array.isArray(contents)) return null;

  const parts: string[] = [];
  for (const content of contents) {
    if (typeof content === "string") {
      parts.push(content);
      continue;
    }
    if (content && typeof content === "object" && "text" in content && typeof content.text === "string") {
      parts.push(content.text);
      continue;
    }
    return null;
  }
  const prompt = parts.join("\n").trim();
  return prompt || null;
}

import { describe, expect, it } from "vitest";
import { fallbackReason, isTimeout, textContents } from "./provider-utils.ts";

describe("provider fallback policy", () => {
  it("permite fallback apenas para 429 e erros 5xx", () => {
    expect(fallbackReason(429)).toBe("rate_limit");
    expect(fallbackReason(500)).toBe("upstream_error");
    expect(fallbackReason(503)).toBe("upstream_error");
    expect(fallbackReason(400)).toBeNull();
    expect(fallbackReason(401)).toBeNull();
    expect(fallbackReason(403)).toBeNull();
  });

  it("reconhece apenas abortos e timeouts", () => {
    expect(isTimeout(new DOMException("timeout", "TimeoutError"))).toBe(true);
    expect(isTimeout(new DOMException("abort", "AbortError"))).toBe(true);
    expect(isTimeout(new Error("network"))).toBe(false);
  });

  it("normaliza texto e rejeita conteúdo multimodal", () => {
    expect(textContents("prompt")).toBe("prompt");
    expect(textContents(["primeiro", { text: "segundo" }])).toBe("primeiro\nsegundo");
    expect(textContents("   ")).toBeNull();
    expect(textContents([{ inlineData: { data: "base64", mimeType: "application/pdf" } }, "prompt"])).toBeNull();
  });
});

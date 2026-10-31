import { describe, expect, it, vi } from "vitest";
import { TranslationError, translateChunk } from "../src/translator";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const okBody = (text: string, finishReason?: string) => ({
  candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }],
});

function run(fetchFn: unknown, sleep = vi.fn(async () => {})) {
  return translateChunk("x", {
    apiKey: "K",
    model: "gemini-test",
    systemPrompt: "S",
    fetchFn: fetchFn as typeof fetch,
    sleep,
  });
}

describe("structured TranslationError", () => {
  it("auth error carries httpStatus", async () => {
    const err = await run(vi.fn(async () => json({}, 403))).catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(err.httpStatus).toBe(403);
  });

  it('404 has kind "model_not_found" and httpStatus 404', async () => {
    const err = await run(vi.fn(async () => json({}, 404))).catch((e) => e);
    expect(err.kind).toBe("model_not_found");
    expect(err.httpStatus).toBe(404);
    expect(err.message).toContain("gemini-test");
  });

  it("other errors expose Google's own message as detail", async () => {
    const fetchFn = vi.fn(async () => json({ error: { message: "Request payload is bad" } }, 400));
    const err = await run(fetchFn).catch((e) => e);
    expect(err.kind).toBe("other");
    expect(err.httpStatus).toBe(400);
    expect(err.detail).toBe("Request payload is bad");
  });

  it("still works as a two-argument constructor", () => {
    const err = new TranslationError("m", "network");
    expect(err.kind).toBe("network");
    expect(err.httpStatus).toBeUndefined();
  });
});

describe("server errors are retried", () => {
  it("503 then 200 succeeds", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(okBody("ok")));
    expect(await run(fetchFn)).toBe("ok");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('503 forever throws kind "server_error" after 4 attempts, with status and detail', async () => {
    const fetchFn = vi.fn(async () => json({ error: { message: "model is overloaded" } }, 503));
    const sleep = vi.fn(async () => {});
    const err = await run(fetchFn, sleep).catch((e) => e);
    expect(err.kind).toBe("server_error");
    expect(err.httpStatus).toBe(503);
    expect(err.detail).toBe("model is overloaded");
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
  });
});

describe("429 honours Google's retryDelay", () => {
  const retryInfo = (delay: string) => ({
    error: {
      message: "quota",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }],
    },
  });

  it("sleeps for the suggested delay", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json(retryInfo("5s"), 429)).mockResolvedValueOnce(json(okBody("ok")));
    const sleep = vi.fn(async () => {});
    await run(fetchFn, sleep);
    expect(sleep.mock.calls[0][0]).toBe(5000);
  });

  it("caps the delay at 60 seconds", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json(retryInfo("300s"), 429)).mockResolvedValueOnce(json(okBody("ok")));
    const sleep = vi.fn(async () => {});
    await run(fetchFn, sleep);
    expect(sleep.mock.calls[0][0]).toBe(60000);
  });

  it("exhausted 429 exposes retryAfterMs and detail", async () => {
    const fetchFn = vi.fn(async () => json(retryInfo("37s"), 429));
    const err = await run(fetchFn).catch((e) => e);
    expect(err.kind).toBe("rate_limit");
    expect(err.retryAfterMs).toBe(37000);
    expect(err.detail).toBe("quota");
  });
});

describe("finishReason and safety blocks", () => {
  it('MAX_TOKENS throws kind "truncated"', async () => {
    const err = await run(vi.fn(async () => json(okBody("partial", "MAX_TOKENS")))).catch((e) => e);
    expect(err.kind).toBe("truncated");
  });

  it('SAFETY with partial text throws kind "blocked"', async () => {
    const err = await run(vi.fn(async () => json(okBody("partial", "SAFETY")))).catch((e) => e);
    expect(err.kind).toBe("blocked");
  });

  it('promptFeedback.blockReason with no candidates throws kind "blocked"', async () => {
    const body = { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } };
    const err = await run(vi.fn(async () => json(body))).catch((e) => e);
    expect(err.kind).toBe("blocked");
  });

  it("finishReason STOP is a normal success", async () => {
    expect(await run(vi.fn(async () => json(okBody("done", "STOP"))))).toBe("done");
  });
});

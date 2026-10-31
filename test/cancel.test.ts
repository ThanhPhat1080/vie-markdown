import { describe, expect, it, vi } from "vitest";
import { translateDocument } from "../src/pipeline";
import { translateChunk } from "../src/translator";

function abortableFetch(): { fetchFn: typeof fetch; started: Promise<void> } {
  let markStarted!: () => void;
  const started = new Promise<void>((r) => (markStarted = r));
  const fetchFn = ((_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      markStarted();
      init.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    })) as unknown as typeof fetch;
  return { fetchFn, started };
}

const base = { apiKey: "K", model: "m", systemPrompt: "S" };

describe("translator cancellation", () => {
  it('aborting during an in-flight request rejects with kind "cancelled"', async () => {
    const { fetchFn, started } = abortableFetch();
    const controller = new AbortController();
    const pending = translateChunk("x", { ...base, fetchFn, signal: controller.signal }).catch((e) => e);
    await started;
    controller.abort();
    const err = await pending;
    expect(err.kind).toBe("cancelled");
  });

  it('an already-aborted signal rejects with kind "cancelled" without calling fetch', async () => {
    const fetchFn = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const err = await translateChunk("x", {
      ...base,
      fetchFn: fetchFn as unknown as typeof fetch,
      signal: controller.signal,
    }).catch((e) => e);
    expect(err.kind).toBe("cancelled");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes an AbortSignal to fetch even when the caller gives none (request timeout)", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), {
          status: 200,
        }),
    );
    await translateChunk("x", { ...base, fetchFn: fetchFn as unknown as typeof fetch });
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("pipeline cancellation", () => {
  it("when translate throws after isCancelled turned true: completed:false and no error", async () => {
    let cancelled = false;
    const res = await translateDocument("# A\none\n", {
      maxChars: 1000,
      isCancelled: () => cancelled,
      translate: async () => {
        cancelled = true;
        throw new Error("aborted");
      },
    });
    expect(res.completed).toBe(false);
    expect(res.error).toBeUndefined();
  });
});

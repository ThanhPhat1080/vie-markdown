import { describe, expect, it, vi } from "vitest";
import { translateChunkGroq } from "../src/groq";
import { TranslationError } from "../src/translator";

function ok(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

function status(code: number): Response {
  return new Response("{}", { status: code });
}

function opts(fetchFn: typeof fetch, sleep = vi.fn(async () => {})) {
  return { apiKey: "KEY", model: "llama-test", systemPrompt: "SYS", fetchFn, sleep };
}

describe("translateChunkGroq", () => {
  it("sends POST to the Groq chat completions endpoint with bearer key, system and user messages", async () => {
    const fetchFn = vi.fn(async () => ok("xin chào"));
    await translateChunkGroq("hello", opts(fetchFn as unknown as typeof fetch));

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer KEY");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("llama-test");
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hello" },
    ]);
  });

  it("returns choices[0].message.content", async () => {
    const fetchFn = vi.fn(async () => ok("một hai"));
    expect(await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch))).toBe("một hai");
  });

  it('retries on 429 up to 3 times with increasing sleep, then throws kind "rate_limit"', async () => {
    const fetchFn = vi.fn(async () => status(429));
    const sleep = vi.fn(async () => {});
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch, sleep)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(TranslationError);
    expect(err.kind).toBe("rate_limit");
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
  });

  it("succeeds when a retry after 429 returns 200", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok("được rồi"));
    expect(await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch))).toBe("được rồi");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('%i throws kind "auth" without retrying', async (code) => {
    const fetchFn = vi.fn(async () => status(code));
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('empty content throws kind "empty"', async () => {
    const fetchFn = vi.fn(async () => ok(""));
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("empty");
  });

  it('retries 5xx then throws kind "server_error" naming Groq', async () => {
    const fetchFn = vi.fn(async () => status(503));
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("server_error");
    expect(err.message).toContain("Groq");
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('other HTTP errors throw kind "other" without retrying', async () => {
    const fetchFn = vi.fn(async () => status(418));
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("other");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("404 throws model_not_found", async () => {
    const fetchFn = vi.fn(async () => status(404));
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("model_not_found");
  });

  it("honours retry-after on 429", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "3" } }))
      .mockResolvedValueOnce(ok("ok"));
    const sleep = vi.fn(async () => {});
    await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch, sleep));
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("gives up at once when retry-after is too long to be worth waiting", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "600" } }));
    const sleep = vi.fn(async () => {});
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch, sleep)).catch((e) => e);
    expect(err.kind).toBe("rate_limit");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('timeout throws kind "timeout"', async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("timeout");
  });

  it("passes a timeout signal to fetch", async () => {
    const fetchFn = vi.fn(async () => ok("x"));
    await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch));
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('finish_reason "length" throws kind "truncated"', async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "a" }, finish_reason: "length" }] })),
    );
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("truncated");
  });

  it("splits an oversized chunk into several requests and joins the results", async () => {
    const para = "word ".repeat(300).trim();
    const text = Array.from({ length: 6 }, () => para).join("\n\n");
    const fetchFn = vi.fn(async () => ok("T"));
    const out = await translateChunkGroq(text, opts(fetchFn as unknown as typeof fetch));
    expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
    expect(out.split("\n\n").length).toBe(fetchFn.mock.calls.length);
  });

  it('fetch rejection throws kind "network"', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("network");
  });

  it("strips a single outer ```markdown fence wrapping the whole response", async () => {
    const fetchFn = vi.fn(async () => ok("```markdown\n# A\n```"));
    expect(await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch))).toBe("# A");
  });
});

describe("translateChunkGroq: error provider", () => {
  it("tags errors with provider groq", async () => {
    const fetchFn = vi.fn(async () => status(401));
    const err = await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.provider).toBe("groq");
  });
});

describe("translateChunkGroq: reasoning output", () => {
  it("drops an inline <think> block before the translation", async () => {
    const fetchFn = vi.fn(async () => ok("<think>nghĩ…\nnhiều dòng</think>\n# Xin chào"));
    expect(await translateChunkGroq("x", opts(fetchFn as unknown as typeof fetch))).toBe("# Xin chào");
  });
});

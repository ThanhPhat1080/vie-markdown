import { describe, expect, it, vi } from "vitest";
import { TranslationError, translateChunk } from "../src/translator";

function ok(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200 },
  );
}

function status(code: number): Response {
  return new Response("{}", { status: code });
}

function opts(fetchFn: typeof fetch, sleep = vi.fn(async () => {})) {
  return { apiKey: "KEY", model: "gemini-test", systemPrompt: "SYS", fetchFn, sleep };
}

describe("translateChunk", () => {
  it("sends POST to the Gemini endpoint with key header, systemInstruction and user text", async () => {
    const fetchFn = vi.fn(async () => ok("xin chào"));
    await translateChunk("hello", opts(fetchFn as unknown as typeof fetch));

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("SYS");
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toBe("hello");
  });

  it("returns concatenated text of candidates[0].content.parts", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "một " }, { text: "hai" }] } }],
        }),
        { status: 200 },
      ),
    );
    expect(await translateChunk("x", opts(fetchFn as unknown as typeof fetch))).toBe("một hai");
  });

  it('retries on 429 up to 3 times with increasing sleep, then throws kind "rate_limit"', async () => {
    const fetchFn = vi.fn(async () => status(429));
    const sleep = vi.fn(async () => {});
    const err = await translateChunk("x", opts(fetchFn as unknown as typeof fetch, sleep)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(TranslationError);
    expect(err.kind).toBe("rate_limit");
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
  });

  it("succeeds when a retry after 429 returns 200", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok("được rồi"));
    expect(await translateChunk("x", opts(fetchFn as unknown as typeof fetch))).toBe("được rồi");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('%i throws kind "auth" without retrying', async (code) => {
    const fetchFn = vi.fn(async () => status(code));
    const err = await translateChunk("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('400 "API key not valid" (what Gemini returns for a bad key) throws kind "auth"', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }), {
          status: 400,
        }),
    );
    const err = await translateChunk("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("auth");
  });

  it('empty candidates (safety block) throws kind "empty"', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    const err = await translateChunk("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("empty");
  });

  it('fetch rejection throws kind "network"', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await translateChunk("x", opts(fetchFn as unknown as typeof fetch)).catch((e) => e);
    expect(err.kind).toBe("network");
  });

  it("strips a single outer ```markdown fence wrapping the whole response", async () => {
    const wrapped = "```markdown\n# A\n\n```sh\necho\n```\n\n```";
    const fetchFn = vi.fn(async () => ok(wrapped));
    const out = await translateChunk("x", opts(fetchFn as unknown as typeof fetch));
    expect(out).toBe("# A\n\n```sh\necho\n```");
  });

  it("does not strip a response that merely starts with a non-markdown code block", async () => {
    const text = "```sh\necho\n```";
    const fetchFn = vi.fn(async () => ok(text));
    expect(await translateChunk("x", opts(fetchFn as unknown as typeof fetch))).toBe(text);
  });
});

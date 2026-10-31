export type TranslationErrorKind = "auth" | "rate_limit" | "network" | "empty" | "other";

export class TranslationError extends Error {
  constructor(
    message: string,
    readonly kind: TranslationErrorKind,
  ) {
    super(message);
    this.name = "TranslationError";
  }
}

export interface TranslatorOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_DELAYS_MS = [2000, 4000, 8000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function stripOuterMarkdownFence(text: string): string {
  const lines = text.trim().split("\n");
  if (lines.length >= 2 && /^```(markdown|md)\s*$/.test(lines[0]) && lines[lines.length - 1].trim() === "```") {
    return lines.slice(1, -1).join("\n").trimEnd();
  }
  return text;
}

export async function translateChunk(text: string, opts: TranslatorOptions): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text }] }],
    }),
  };

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(url, init);
    } catch (e) {
      throw new TranslationError(`Lỗi mạng: ${e instanceof Error ? e.message : String(e)}`, "network");
    }

    if (res.status === 429) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new TranslationError("Hết hạn mức của gói free (429). Hãy chờ vài phút rồi chạy lại.", "rate_limit");
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    const bodyText = await res.text();
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(bodyText))) {
      throw new TranslationError("API key không hợp lệ hoặc không có quyền.", "auth");
    }
    if (!res.ok) {
      throw new TranslationError(`Gemini trả về lỗi ${res.status}.`, "other");
    }

    let parts: Array<{ text?: string }> | undefined;
    try {
      parts = JSON.parse(bodyText).candidates?.[0]?.content?.parts;
    } catch {
      parts = undefined;
    }
    const result = parts?.map((p) => p.text ?? "").join("") ?? "";
    if (result === "") {
      throw new TranslationError("Gemini không trả về nội dung (có thể bị bộ lọc an toàn chặn).", "empty");
    }
    return stripOuterMarkdownFence(result);
  }
}

export type TranslationErrorKind =
  | "auth"
  | "rate_limit"
  | "server_error"
  | "network"
  | "empty"
  | "blocked"
  | "truncated"
  | "model_not_found"
  | "cancelled"
  | "other";

export interface TranslationErrorInfo {
  httpStatus?: number;
  /** Google's own error message, when the response body had one. */
  detail?: string;
  /** Delay Google asked us to wait before retrying (429). */
  retryAfterMs?: number;
}

export class TranslationError extends Error {
  readonly httpStatus?: number;
  readonly detail?: string;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    readonly kind: TranslationErrorKind,
    info: TranslationErrorInfo = {},
  ) {
    super(message);
    this.name = "TranslationError";
    this.httpStatus = info.httpStatus;
    this.detail = info.detail;
    this.retryAfterMs = info.retryAfterMs;
  }
}

export interface TranslatorOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

export const RETRY_DELAYS_MS = [2000, 4000, 8000];

export const REQUEST_TIMEOUT_MS = 120_000;

const MAX_RETRY_DELAY_MS = 60_000;
const RETRYABLE_SERVER_STATUS = new Set([500, 502, 503, 504]);
const BLOCKING_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
]);

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const cancelled = () => new TranslationError("Đã hủy.", "cancelled");

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function stripOuterMarkdownFence(text: string): string {
  const lines = text.trim().split("\n");
  if (lines.length >= 2 && /^```(markdown|md)\s*$/.test(lines[0]) && lines[lines.length - 1].trim() === "```") {
    return lines.slice(1, -1).join("\n").trimEnd();
  }
  return text;
}

/** Pull the human-readable message and RetryInfo delay out of a Google error body. */
function parseGoogleError(bodyText: string): { detail?: string; retryAfterMs?: number } {
  try {
    const error = JSON.parse(bodyText)?.error;
    const detail = typeof error?.message === "string" ? error.message : undefined;
    const retryInfo = Array.isArray(error?.details)
      ? error.details.find((d: { "@type"?: unknown }) => String(d?.["@type"]).endsWith("RetryInfo"))
      : undefined;
    const match = /^(\d+(?:\.\d+)?)s$/.exec(String(retryInfo?.retryDelay ?? ""));
    return { detail, retryAfterMs: match ? Math.round(parseFloat(match[1]) * 1000) : undefined };
  } catch {
    return {};
  }
}

export async function translateChunk(text: string, opts: TranslatorOptions): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => abortableSleep(ms, opts.signal));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text }] }],
  });

  const toError = (e: unknown): TranslationError => {
    if (opts.signal?.aborted) return cancelled();
    if (e instanceof Error && e.name === "TimeoutError") {
      return new TranslationError("Quá thời gian chờ phản hồi từ Gemini.", "network");
    }
    return new TranslationError(`Lỗi mạng: ${e instanceof Error ? e.message : String(e)}`, "network");
  };

  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw cancelled();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body,
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    };
    let res: Response;
    let bodyText: string;
    try {
      res = await fetchFn(url, init);
      bodyText = await res.text();
    } catch (e) {
      throw toError(e);
    }

    const isRateLimit = res.status === 429;
    if (isRateLimit || RETRYABLE_SERVER_STATUS.has(res.status)) {
      const info = { httpStatus: res.status, ...parseGoogleError(bodyText) };
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw isRateLimit
          ? new TranslationError("Hết hạn mức của gói free (429). Hãy chờ vài phút rồi chạy lại.", "rate_limit", info)
          : new TranslationError(`Gemini đang quá tải hoặc lỗi tạm thời (HTTP ${res.status}).`, "server_error", info);
      }
      await sleep(Math.min(info.retryAfterMs ?? RETRY_DELAYS_MS[attempt], MAX_RETRY_DELAY_MS));
      continue;
    }

    const failure = { httpStatus: res.status, ...parseGoogleError(bodyText) };
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(bodyText))) {
      throw new TranslationError("API key không hợp lệ hoặc không có quyền.", "auth", failure);
    }
    if (res.status === 404) {
      throw new TranslationError(
        `Model "${opts.model}" không tồn tại hoặc tài khoản không được dùng (404). Hãy đổi setting vieMarkdown.model sang model còn hiệu lực, ví dụ gemini-3.5-flash-lite.`,
        "model_not_found",
        failure,
      );
    }
    if (!res.ok) {
      throw new TranslationError(`Gemini trả về lỗi ${res.status}.`, "other", failure);
    }

    let parsed: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    } = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = {};
    }
    const candidate = parsed.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if ((!candidate && parsed.promptFeedback?.blockReason) || (finishReason && BLOCKING_FINISH_REASONS.has(finishReason))) {
      const reason = finishReason ?? parsed.promptFeedback?.blockReason;
      throw new TranslationError(`Gemini từ chối nội dung do bộ lọc an toàn (${reason}).`, "blocked", { httpStatus: res.status, detail: reason });
    }
    if (finishReason === "MAX_TOKENS") {
      throw new TranslationError("Bản dịch bị cắt vì vượt giới hạn độ dài đầu ra (MAX_TOKENS).", "truncated", { httpStatus: res.status, detail: finishReason });
    }
    const result = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (result === "") {
      throw new TranslationError("Gemini không trả về nội dung.", "empty", { httpStatus: res.status });
    }
    return stripOuterMarkdownFence(result);
  }
}

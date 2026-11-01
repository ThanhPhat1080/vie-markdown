import { splitMarkdown } from "./splitter";
import {
  TranslationError,
  TranslationErrorInfo,
  TranslationErrorKind,
  TranslatorOptions,
  abortableSleep,
  cancelled,
  requestTimeoutMs,
  stripOuterMarkdownFence,
} from "./translator";

const groqError = (message: string, kind: TranslationErrorKind, info: TranslationErrorInfo = {}) =>
  new TranslationError(message, kind, { ...info, provider: "groq" });

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Light, free and fast on Groq. Model availability changes; check with `debug.js --list-models --provider groq`. */
export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

/** Groq is fast: a request taking much longer than this (scaled up for long pieces) is stuck, so fail early instead of hanging. */
export const GROQ_TIMEOUT_MS = 45_000;

/**
 * Free-plan tokens-per-minute limits are small (6k for the default model), so a chunk meant for
 * Gemini is cut into pieces this size; Vietnamese output costs roughly 2 tokens per character-ish word.
 */
export const GROQ_MAX_CHUNK_CHARS = 4000;

export const GROQ_RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Longer waits than this (e.g. an exhausted daily quota) are not worth blocking the user for. */
const MAX_WAIT_MS = 20_000;
const RETRYABLE_SERVER_STATUS = new Set([500, 502, 503, 504]);

function parseRetryAfterMs(res: Response): number | undefined {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
}

function errorDetail(bodyText: string): string | undefined {
  try {
    const message = JSON.parse(bodyText)?.error?.message;
    return typeof message === "string" ? message : undefined;
  } catch {
    return undefined;
  }
}

/** Some reasoning models inline their thoughts as <think>…</think>; that is not part of the translation. */
const stripThinking = (text: string): string => text.replace(/<think>[\s\S]*?<\/think>\s*/g, "");

async function translatePiece(text: string, opts: TranslatorOptions): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => abortableSleep(ms, opts.signal));
  const body = JSON.stringify({
    model: opts.model,
    temperature: 0,
    // gpt-oss models "think" first; low effort keeps translation fast and leaves output budget for the text.
    ...(opts.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: text },
    ],
  });

  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw cancelled();
    const timeout = AbortSignal.timeout(requestTimeoutMs(text.length, GROQ_TIMEOUT_MS));
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body,
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    };

    let res: Response;
    let bodyText: string;
    try {
      res = await fetchFn(GROQ_URL, init);
      bodyText = await res.text();
    } catch (e) {
      if (opts.signal?.aborted) throw cancelled();
      if (e instanceof Error && e.name === "TimeoutError") {
        throw groqError("Quá thời gian chờ phản hồi từ Groq.", "timeout");
      }
      throw groqError(`Lỗi mạng: ${e instanceof Error ? e.message : String(e)}`, "network");
    }
    const info = { httpStatus: res.status, detail: errorDetail(bodyText) };

    const isRateLimit = res.status === 429;
    if (isRateLimit || RETRYABLE_SERVER_STATUS.has(res.status)) {
      const wait = parseRetryAfterMs(res) ?? GROQ_RETRY_DELAYS_MS[attempt];
      if (attempt >= GROQ_RETRY_DELAYS_MS.length || wait > MAX_WAIT_MS) {
        throw isRateLimit
          ? groqError("Groq cũng hết hạn mức (429). Hãy chờ rồi chạy lại.", "rate_limit", {
              ...info,
              retryAfterMs: parseRetryAfterMs(res),
            })
          : groqError(`Groq đang quá tải hoặc lỗi tạm thời (HTTP ${res.status}).`, "server_error", info);
      }
      await sleep(wait);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw groqError("API key Groq không hợp lệ hoặc không có quyền.", "auth", info);
    }
    if (res.status === 404) {
      throw groqError(
        `Model Groq "${opts.model}" không tồn tại hoặc tài khoản không được dùng (404). Hãy chọn model khác trong setting vieMarkdown.groqModel (xem danh sách bằng: node out/debug.js --list-models --provider groq).`,
        "model_not_found",
        info,
      );
    }
    if (!res.ok) {
      throw groqError(`Groq trả về lỗi ${res.status}.`, "other", info);
    }

    let choice: { message?: { content?: string }; finish_reason?: string } | undefined;
    try {
      choice = JSON.parse(bodyText).choices?.[0];
    } catch {
      choice = undefined;
    }
    if (choice?.finish_reason === "length") {
      throw groqError("Bản dịch Groq bị cắt vì vượt giới hạn độ dài đầu ra.", "truncated", {
        httpStatus: res.status,
        detail: "length",
      });
    }
    const content = choice?.message?.content;
    if (!content) {
      throw groqError("Groq không trả về nội dung.", "empty", { httpStatus: res.status });
    }
    return stripOuterMarkdownFence(stripThinking(content));
  }
}

export async function translateChunkGroq(text: string, opts: TranslatorOptions): Promise<string> {
  const pieces = splitMarkdown(text, GROQ_MAX_CHUNK_CHARS);
  const out: string[] = [];
  for (const piece of pieces) out.push((await translatePiece(piece, opts)).trimEnd());
  return out.join("\n\n");
}

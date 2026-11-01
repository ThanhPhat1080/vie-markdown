import type { PipelineResult } from "./pipeline";

export type NotificationAction =
  | "enterKey"
  | "enterGroqKey"
  | "openModelSetting"
  | "openGroqModelSetting"
  | "openLog";

export interface Notification {
  level: "error" | "warning" | "info";
  message: string;
  actions: NotificationAction[];
}

export interface OutcomeContext {
  model: string;
  /** Model used when the error came from Groq; falls back to `model`. */
  groqModel?: string;
}

const MAX_SNIPPETS = 3;
const SNIPPET_CHARS = 60;
const MAX_DETAIL_CHARS = 200;

const snippet = (p: string) => (p.length > SNIPPET_CHARS ? `${p.slice(0, SNIPPET_CHARS).trimEnd()}…` : p);

function errorHeadline(r: PipelineResult, model: string): string {
  const service = r.errorProvider === "groq" ? "Groq" : "Gemini";
  const part = r.failedChunk ? `phần ${r.failedChunk}` : "một phần";
  switch (r.errorKind) {
    case "auth":
      return "API key không hợp lệ hoặc không có quyền. Key đã lưu đã bị xóa, hãy nhập key mới.";
    case "model_not_found":
      return `Model "${model}" không tồn tại hoặc tài khoản này không được dùng (404). Hãy chọn model khác trong cài đặt.`;
    case "rate_limit":
      return "Đã hết hạn mức của gói free (429) dù đã thử lại 3 lần. Hãy chờ vài phút rồi chạy lại, hoặc đổi model.";
    case "server_error":
      return `${service} đang quá tải hoặc lỗi tạm thời (HTTP ${r.httpStatus ?? "5xx"}) dù đã thử lại 3 lần. Hãy thử lại sau ít phút.`;
    case "timeout":
      return "Model phản hồi quá chậm (quá thời gian chờ). Hãy thử lại, hoặc dùng model nhẹ hơn/Groq.";
    case "network":
      return `Không kết nối được tới ${service} hoặc quá thời gian chờ. Kiểm tra mạng/VPN, hoặc thử model nhẹ hơn.`;
    case "blocked":
      return `${service} từ chối dịch ${part} do bộ lọc an toàn.`;
    case "truncated":
      return `Bản dịch ${part} bị cắt vì vượt giới hạn độ dài đầu ra.`;
    case "empty":
      return `${service} không trả về nội dung cho ${part}.`;
    default:
      return r.error ?? "Lỗi không xác định.";
  }
}

function errorActions(kind: PipelineResult["errorKind"], provider: PipelineResult["errorProvider"]): NotificationAction[] {
  const groq = provider === "groq";
  switch (kind) {
    case "auth":
      return [groq ? "enterGroqKey" : "enterKey"];
    case "model_not_found":
      return [groq ? "openGroqModelSetting" : "openModelSetting", "openLog"];
    case "rate_limit":
    case "timeout":
    case "network":
      return [groq ? "openGroqModelSetting" : "openModelSetting", "openLog"];
    default:
      return ["openLog"];
  }
}

function describeError(r: PipelineResult, ctx: OutcomeContext): Notification {
  let message = errorHeadline(r, r.errorProvider === "groq" ? (ctx.groqModel ?? ctx.model) : ctx.model);
  if (r.errorDetail) message += ` Chi tiết từ ${r.errorProvider === "groq" ? "Groq" : "Google"}: ${r.errorDetail.slice(0, MAX_DETAIL_CHARS)}`;
  if (r.text !== "" && r.translatedChunks > 0) {
    message += ` Đã dịch ${r.translatedChunks}/${r.totalChunks} phần (lỗi ở phần ${r.failedChunk}); bản dịch một phần nằm trong tab mới.`;
  }
  return { level: "error", message, actions: errorActions(r.errorKind, r.errorProvider) };
}

/** Everything the user should be told after a run, as notifications ready to show. */
export function describeOutcome(r: PipelineResult, ctx: OutcomeContext): Notification[] {
  if (r.error) return [describeError(r, ctx)];

  if (!r.completed) {
    const message =
      r.text !== ""
        ? `Đã hủy. Đã dịch ${r.translatedChunks}/${r.totalChunks} phần; bản dịch một phần nằm trong tab mới.`
        : "Đã hủy trước khi có phần nào được dịch.";
    return [{ level: "info", message, actions: [] }];
  }

  const notifications: Notification[] = [];
  if (r.warnings.length > 0) {
    notifications.push({
      level: "warning",
      message: `Bản dịch có thể lệch định dạng so với bản gốc: ${r.warnings.join(" ")}`,
      actions: ["openLog"],
    });
  }
  if (r.untranslated.length > 0) {
    const shown = r.untranslated.slice(0, MAX_SNIPPETS).map((p) => `"${snippet(p)}"`).join(", ");
    const more = r.untranslated.length > MAX_SNIPPETS ? `, … và ${r.untranslated.length - MAX_SNIPPETS} đoạn khác` : "";
    notifications.push({
      level: "warning",
      message: `Có ${r.untranslated.length} đoạn có vẻ chưa được dịch (còn nguyên tiếng Anh): ${shown}${more}. Hãy kiểm tra và dịch bổ sung trong tab mới.`,
      actions: ["openLog"],
    });
  }
  if (notifications.length === 0) {
    notifications.push({ level: "info", message: `Đã dịch xong (${r.totalChunks} phần).`, actions: [] });
  }
  return notifications;
}

/** Full-detail lines for the output channel. */
export function describeForLog(r: PipelineResult): string[] {
  const lines = [
    `Kết quả: đã dịch ${r.translatedChunks}/${r.totalChunks} phần, ${r.completed ? "hoàn tất" : "chưa hoàn tất"}.`,
  ];
  if (r.error) {
    lines.push(`LỖI [${r.errorKind ?? "unknown"}] ${r.error}`);
    if (r.httpStatus !== undefined) lines.push(`  HTTP ${r.httpStatus}`);
    if (r.errorDetail) lines.push(`  Chi tiết từ ${r.errorProvider === "groq" ? "Groq" : "Google"}: ${r.errorDetail}`);
    if (r.failedChunk !== undefined) lines.push(`  Lỗi ở phần ${r.failedChunk}.`);
  }
  for (const w of r.warnings) lines.push(`CẢNH BÁO định dạng: ${w}`);
  for (const p of r.untranslated) lines.push(`CHƯA DỊCH: ${p}`);
  return lines;
}

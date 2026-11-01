import { describe, expect, it } from "vitest";
import { describeForLog, describeOutcome } from "../src/messages";
import type { PipelineResult } from "../src/pipeline";

const ctx = { model: "gemini-test" };

function result(over: Partial<PipelineResult> = {}): PipelineResult {
  return {
    text: "",
    warnings: [],
    completed: false,
    translatedChunks: 0,
    totalChunks: 3,
    untranslated: [],
    ...over,
  };
}

const failed = (over: Partial<PipelineResult>) =>
  describeOutcome(result({ error: "x", failedChunk: 1, ...over }), ctx)[0];

describe("describeOutcome: errors", () => {
  it("auth: error level, names the key, offers to enter a new key", () => {
    const n = failed({ errorKind: "auth", httpStatus: 403 });
    expect(n.level).toBe("error");
    expect(n.message).toContain("API key");
    expect(n.actions).toEqual(["enterKey"]);
  });

  it("model_not_found: names the model and offers the model setting", () => {
    const n = failed({ errorKind: "model_not_found", httpStatus: 404 });
    expect(n.message).toContain("gemini-test");
    expect(n.actions).toContain("openModelSetting");
  });

  it("rate_limit: mentions the quota and offers setting and log", () => {
    const n = failed({ errorKind: "rate_limit", httpStatus: 429 });
    expect(n.message).toContain("hạn mức");
    expect(n.actions).toEqual(expect.arrayContaining(["openModelSetting", "openLog"]));
  });

  it("network: mentions the network", () => {
    expect(failed({ errorKind: "network" }).message).toContain("mạng");
  });

  it("server_error: mentions overload and the HTTP status", () => {
    const n = failed({ errorKind: "server_error", httpStatus: 503 });
    expect(n.message).toContain("quá tải");
    expect(n.message).toContain("503");
  });

  it("truncated and blocked name the failed chunk", () => {
    expect(failed({ errorKind: "truncated", failedChunk: 2 }).message).toContain("phần 2");
    expect(failed({ errorKind: "truncated", failedChunk: 2 }).message).toContain("cắt");
    expect(failed({ errorKind: "blocked", failedChunk: 2 }).message).toContain("bộ lọc");
  });

  it("empty response", () => {
    expect(failed({ errorKind: "empty" }).message).toContain("không trả về nội dung");
  });

  it("other: includes the error text and Google's detail", () => {
    const n = failed({ errorKind: "other", error: "Gemini trả về lỗi 400.", errorDetail: "bad payload" });
    expect(n.message).toContain("Gemini trả về lỗi 400.");
    expect(n.message).toContain("bad payload");
  });

  it("partial result says how many chunks were translated and that the partial text is in the new tab", () => {
    const n = failed({
      errorKind: "rate_limit",
      text: "một phần",
      translatedChunks: 1,
      totalChunks: 3,
      failedChunk: 2,
    });
    expect(n.message).toContain("1/3");
    expect(n.message).toContain("phần 2");
    expect(n.message).toContain("tab mới");
  });

  it("no partial text: does not claim a tab was opened", () => {
    const n = failed({ errorKind: "network", text: "", translatedChunks: 0 });
    expect(n.message).not.toContain("tab mới");
  });

  it("every error offers the log", () => {
    expect(failed({ errorKind: "network" }).actions).toContain("openLog");
  });
});

describe("describeOutcome: cancel and success", () => {
  it("cancel with partial progress", () => {
    const n = describeOutcome(result({ text: "x", translatedChunks: 1, totalChunks: 3 }), ctx)[0];
    expect(n.level).toBe("info");
    expect(n.message).toContain("hủy");
    expect(n.message).toContain("1/3");
  });

  it("cancel before anything was translated", () => {
    const n = describeOutcome(result({ translatedChunks: 0 }), ctx)[0];
    expect(n.message).toContain("hủy");
    expect(n.message).not.toContain("tab mới");
  });

  it("clean success is a single info notification", () => {
    const ns = describeOutcome(result({ completed: true, text: "x", translatedChunks: 3 }), ctx);
    expect(ns).toHaveLength(1);
    expect(ns[0].level).toBe("info");
    expect(ns[0].message).toContain("Đã dịch xong");
  });

  it("format warnings are listed in a warning notification", () => {
    const ns = describeOutcome(
      result({ completed: true, text: "x", translatedChunks: 3, warnings: ["Số link/ảnh lệch: gốc 2, bản dịch 1."] }),
      ctx,
    );
    const w = ns.find((n) => n.level === "warning")!;
    expect(w.message).toContain("lệch định dạng");
    expect(w.message).toContain("Số link/ảnh lệch");
  });

  it("untranslated paragraphs: count, snippets and the log action", () => {
    const long = "Authoritative rules for branches, PRs and deploys. Claude must follow this exactly and always.";
    const ns = describeOutcome(
      result({ completed: true, text: "x", translatedChunks: 3, untranslated: [long, "Second untranslated paragraph that is long enough to count here."] }),
      ctx,
    );
    const w = ns.find((n) => n.level === "warning")!;
    expect(w.message).toContain("2 đoạn");
    expect(w.message).toContain("chưa được dịch");
    expect(w.message).toContain("Authoritative rules for branches");
    expect(w.message).not.toContain("Claude must follow this exactly and always");
    expect(w.actions).toContain("openLog");
  });

  it("shows at most 3 snippets", () => {
    const paras = ["Alpha untranslated paragraph number one is here", "Bravo untranslated paragraph number two is here", "Charlie untranslated paragraph number three is here", "Delta untranslated paragraph number four is here"];
    const w = describeOutcome(result({ completed: true, text: "x", translatedChunks: 3, untranslated: paras }), ctx).find((n) => n.level === "warning")!;
    expect(w.message).toContain("4 đoạn");
    expect(w.message).toContain("Charlie");
    expect(w.message).not.toContain("Delta");
  });
});

describe("describeForLog", () => {
  it("includes error kind, status, detail and failed chunk", () => {
    const lines = describeForLog(
      result({ error: "boom", errorKind: "server_error", httpStatus: 503, errorDetail: "overloaded", failedChunk: 2, translatedChunks: 1 }),
    ).join("\n");
    expect(lines).toContain("server_error");
    expect(lines).toContain("503");
    expect(lines).toContain("overloaded");
    expect(lines).toContain("phần 2");
  });

  it("lists every untranslated paragraph in full and every warning", () => {
    const long = "Authoritative rules for branches, PRs and deploys. Claude must follow this exactly and always.";
    const lines = describeForLog(
      result({ completed: true, text: "x", translatedChunks: 3, untranslated: [long], warnings: ["Số link/ảnh lệch: gốc 2, bản dịch 1."] }),
    ).join("\n");
    expect(lines).toContain(long);
    expect(lines).toContain("Số link/ảnh lệch");
  });
});

describe("describeOutcome: errors from Groq", () => {
  const groqCtx = { model: "gemini-test", groqModel: "llama-test" };
  const groqFailed = (over: Partial<PipelineResult>) =>
    describeOutcome(result({ error: "x", failedChunk: 1, errorProvider: "groq", ...over }), groqCtx)[0];

  it("auth: offers the Groq key, not the Gemini one", () => {
    expect(groqFailed({ errorKind: "auth" }).actions).toEqual(["enterGroqKey"]);
  });

  it("model_not_found: names the Groq model and opens the Groq setting", () => {
    const n = groqFailed({ errorKind: "model_not_found" });
    expect(n.message).toContain("llama-test");
    expect(n.actions).toEqual(["openGroqModelSetting", "openLog"]);
  });

  it("empty and server_error: name Groq instead of Gemini", () => {
    expect(groqFailed({ errorKind: "empty" }).message).toContain("Groq");
    expect(groqFailed({ errorKind: "server_error" }).message).not.toContain("Gemini");
  });
});

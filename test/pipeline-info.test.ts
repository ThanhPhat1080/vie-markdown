import { describe, expect, it, vi } from "vitest";
import { translateDocument } from "../src/pipeline";
import { TranslationError } from "../src/translator";

const three = "# A\none\n\n# B\ntwo\n\n# C\nthree\n";
const SMALL = 10;

describe("pipeline result details", () => {
  it("reports translatedChunks and totalChunks on success", async () => {
    const res = await translateDocument(three, { translate: async (c) => c, maxChars: SMALL });
    expect(res.translatedChunks).toBe(3);
    expect(res.totalChunks).toBe(3);
  });

  it("on error exposes the failed chunk (1-based), kind, status, detail and counts", async () => {
    const translate = vi
      .fn()
      .mockResolvedValueOnce("one")
      .mockRejectedValueOnce(
        new TranslationError("503", "server_error", { httpStatus: 503, detail: "overloaded" }),
      );
    const res = await translateDocument(three, { translate, maxChars: SMALL });
    expect(res.failedChunk).toBe(2);
    expect(res.errorKind).toBe("server_error");
    expect(res.httpStatus).toBe(503);
    expect(res.errorDetail).toBe("overloaded");
    expect(res.translatedChunks).toBe(1);
    expect(res.totalChunks).toBe(3);
  });

  it("lists untranslated paragraphs when the run completes", async () => {
    const para = "Authoritative rules for branches, PRs and deploys. Claude must follow this exactly.";
    const res = await translateDocument(`# T\n\n${para}\n`, {
      translate: async (c) => c,
      maxChars: 1000,
    });
    expect(res.completed).toBe(true);
    expect(res.untranslated).toEqual([para]);
  });

  it("returns no untranslated list for an incomplete run", async () => {
    const res = await translateDocument(three, {
      translate: vi.fn().mockRejectedValue(new Error("boom")),
      maxChars: SMALL,
    });
    expect(res.untranslated).toEqual([]);
  });

  it("empty file has zero chunks", async () => {
    const res = await translateDocument("  \n", { translate: async (c) => c, maxChars: 100 });
    expect(res.totalChunks).toBe(0);
    expect(res.untranslated).toEqual([]);
  });
});

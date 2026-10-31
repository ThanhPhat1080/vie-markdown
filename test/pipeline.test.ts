import { describe, expect, it, vi } from "vitest";
import { translateDocument } from "../src/pipeline";
import { TranslationError } from "../src/translator";

const three = "# A\none\n\n# B\ntwo\n\n# C\nthree\n";
const SMALL = 10; // forces one chunk per section

describe("translateDocument", () => {
  it('whitespace-only source returns completed:false, error "File trống" and never calls translate', async () => {
    const translate = vi.fn(async (c: string) => c);
    const res = await translateDocument("  \n\t\n", { translate, maxChars: 1000 });
    expect(res.completed).toBe(false);
    expect(res.error).toBe("File trống");
    expect(translate).not.toHaveBeenCalled();
  });

  it("translates chunks in order, trims each result's trailing whitespace and joins with a blank line", async () => {
    const translate = vi.fn(async (c: string) => `[${c.trim()}]\n\n\n`);
    const res = await translateDocument(three, { translate, maxChars: SMALL });
    expect(translate).toHaveBeenCalledTimes(3);
    expect(res.text).toBe("[# A\none]\n\n[# B\ntwo]\n\n[# C\nthree]");
    expect(res.completed).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("calls onProgress(done,total) after each chunk", async () => {
    const onProgress = vi.fn();
    await translateDocument(three, { translate: async (c) => c, maxChars: SMALL, onProgress });
    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("when translate throws on chunk 2 of 3: returns text of chunk 1, completed:false, error set from the message", async () => {
    const translate = vi
      .fn()
      .mockResolvedValueOnce("one")
      .mockRejectedValueOnce(new TranslationError("Hết hạn mức", "rate_limit"));
    const res = await translateDocument(three, { translate, maxChars: SMALL });
    expect(res.text).toBe("one");
    expect(res.completed).toBe(false);
    expect(res.error).toBe("Hết hạn mức");
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("when isCancelled becomes true after chunk 1: stops, returns chunk 1, completed:false, no error", async () => {
    let cancelled = false;
    const translate = vi.fn(async (c: string) => {
      cancelled = true;
      return c.trim();
    });
    const res = await translateDocument(three, {
      translate,
      maxChars: SMALL,
      isCancelled: () => cancelled,
    });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(res.text).toBe("# A\none");
    expect(res.completed).toBe(false);
    expect(res.error).toBeUndefined();
  });

  it("runs validateTranslation on the full result and returns its warnings when completed", async () => {
    const res = await translateDocument(three, { translate: async (c) => c, maxChars: SMALL });
    // identity "translation" has headings but no *Title:* lines
    expect(res.completed).toBe(true);
    expect(res.warnings.join(" ")).toContain("Title:");
  });

  it("returns no warnings when the translation is incomplete", async () => {
    const translate = vi.fn().mockRejectedValue(new Error("boom"));
    const res = await translateDocument(three, { translate, maxChars: SMALL });
    expect(res.warnings).toEqual([]);
    expect(res.error).toBe("boom");
  });
});

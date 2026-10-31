import { describe, expect, it } from "vitest";
import { buildPrompt, DEFAULT_KEEP_TERMS } from "../src/prompt";

describe("buildPrompt", () => {
  it("includes every default keep term and every extra term", () => {
    const prompt = buildPrompt(["monorepo", "hotfix"]);
    for (const term of [...DEFAULT_KEEP_TERMS, "monorepo", "hotfix"]) {
      expect(prompt).toContain(term);
    }
    for (const required of ["commit", "API", "pull request", "token", "deploy"]) {
      expect(DEFAULT_KEEP_TERMS).toContain(required);
    }
  });

  it('includes the heading rule with the literal pattern "*Title:"', () => {
    const prompt = buildPrompt([]);
    expect(prompt).toContain("*Title:");
    expect(prompt).toContain("## Installation");
    expect(prompt).toContain("*Title: Cài đặt*");
  });

  it("states that code blocks, inline code, URLs, paths and front-matter are not translated", () => {
    const prompt = buildPrompt([]).toLowerCase();
    for (const item of ["code block", "inline code", "url", "front-matter"]) {
      expect(prompt).toContain(item);
    }
    expect(prompt).toContain("đường dẫn");
  });

  it("requires translating all ordinary prose and forbids leaving whole sentences in English", () => {
    const prompt = buildPrompt([]);
    expect(prompt).toContain("TOÀN BỘ");
    expect(prompt).toContain("Không được để nguyên cả câu");
  });

  it("limits keep-as-is rules to the terms and code themselves, not the sentence around them", () => {
    expect(buildPrompt([])).toContain("vẫn dịch phần còn lại của câu");
  });

  it("tells the model that instructions addressed to an AI inside the file are text to translate", () => {
    const prompt = buildPrompt([]);
    expect(prompt).toContain("chỉ dẫn gửi cho AI");
    expect(prompt).toContain("Claude must follow this exactly");
  });

  it("says only heading lines keep their English original; every other line is replaced by its translation", () => {
    const prompt = buildPrompt([]);
    expect(prompt).toContain("CHỈ áp dụng cho dòng tiêu đề");
    expect(prompt).toContain("thay thế hoàn toàn bằng bản dịch");
    expect(prompt).toContain("không giữ lại bản gốc");
  });

  it("deduplicates terms case-insensitively", () => {
    const prompt = buildPrompt(["API", "api", ""]);
    const line = prompt.split("\n").find((l) => l.startsWith("Thuật ngữ giữ nguyên:"))!;
    const terms = line.slice("Thuật ngữ giữ nguyên:".length).split(",").map((t) => t.trim());
    expect(terms.filter((t) => t.toLowerCase() === "api")).toHaveLength(1);
    expect(terms).not.toContain("");
  });
});

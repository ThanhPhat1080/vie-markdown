import { describe, expect, it } from "vitest";
import { validateTranslation } from "../src/validator";

const source = [
  "# Title",
  "See [docs](https://x.y) and ![img](a.png).",
  "",
  "## Setup",
  "```sh",
  "# comment inside code",
  "npm i",
  "```",
  "",
].join("\n");

const good = [
  "# Title",
  "*Title: Tiêu đề*",
  "Xem [tài liệu](https://x.y) và ![img](a.png).",
  "",
  "## Setup",
  "*Title: Cài đặt*",
  "```sh",
  "# comment inside code",
  "npm i",
  "```",
  "",
].join("\n");

describe("validateTranslation", () => {
  it("returns [] for a faithful translation", () => {
    expect(validateTranslation(source, good)).toEqual([]);
  });

  it("warns when heading count differs", () => {
    const bad = good.replace("## Setup\n*Title: Cài đặt*\n", "*Title: Cài đặt*\n");
    expect(validateTranslation(source, bad).length).toBeGreaterThan(0);
  });

  it("warns when code block count differs", () => {
    const bad = good.replace("```sh\n# comment inside code\nnpm i\n```\n", "npm i\n");
    expect(validateTranslation(source, bad).join(" ")).toContain("code block");
  });

  it("warns when link or image count differs", () => {
    const bad = good.replace("![img](a.png)", "img");
    expect(validateTranslation(source, bad).join(" ")).toContain("link");
  });

  it('warns when number of "*Title:" lines differs from number of headings', () => {
    const bad = good.replace("*Title: Cài đặt*\n", "");
    expect(validateTranslation(source, bad).join(" ")).toContain("Title:");
  });

  it('ignores "# " lines inside fenced code blocks', () => {
    // source has 2 real headings; the "# comment inside code" line must not count
    expect(validateTranslation(source, good)).toEqual([]);
    const onlyCode = "```\n# a\n# b\n```\n";
    expect(validateTranslation(onlyCode, onlyCode)).toEqual([]);
  });

  it('does not count "#hashtag" (no space after #) as a heading', () => {
    const src = "Tag #hashtag here\n# Real\n";
    const out = "Thẻ #hashtag đây\n# Real\n*Title: Thật*\n";
    expect(validateTranslation(src, out)).toEqual([]);
  });

  it("works with CRLF line endings", () => {
    const crlfSource = source.replace(/\n/g, "\r\n");
    const crlfGood = good.replace(/\n/g, "\r\n");
    expect(validateTranslation(crlfSource, crlfGood)).toEqual([]);
  });
});

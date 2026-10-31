import { describe, expect, it } from "vitest";
import { findUntranslatedParagraphs } from "../src/untranslated";

const EN = "Authoritative rules for branches, PRs and deploys. Claude must follow this exactly.";

describe("findUntranslatedParagraphs", () => {
  it("flags a long paragraph left identical to the source", () => {
    const source = `# Title\n\n${EN}\n`;
    const translated = `# Title\n*Title: Tiêu đề*\n\n${EN}\n`;
    expect(findUntranslatedParagraphs(source, translated)).toEqual([EN]);
  });

  it("flags the bilingual case where the English original is kept above the translation", () => {
    const source = `${EN}\n`;
    const translated = `${EN}\nCác quy tắc có thẩm quyền đối với branch, PR và deploy.\n`;
    expect(findUntranslatedParagraphs(source, translated)).toHaveLength(1);
  });

  it("does not flag translated paragraphs", () => {
    const translated = "Các quy tắc có thẩm quyền đối với các branch, pull request và deploy.\n";
    expect(findUntranslatedParagraphs(`${EN}\n`, translated)).toEqual([]);
  });

  it("ignores short paragraphs and paragraphs with fewer than 6 words", () => {
    const source = "OK\n\nSee the docs for details.\n\nsupercalifragilisticexpialidocious-and-more-and-more-text\n";
    expect(findUntranslatedParagraphs(source, source)).toEqual([]);
  });

  it("ignores fenced code blocks, headings, table rows and front-matter", () => {
    const source = [
      "---",
      "description: this long front matter line must stay exactly as it is in English",
      "---",
      "",
      "# This is a long heading that stays in English because headings keep their original",
      "",
      "```sh",
      "echo this long line inside a code block must never be translated or flagged ok",
      "```",
      "",
      "| Branch | Purpose of this branch in the workflow | Deploys to production env |",
      "|---|---|---|",
      "",
    ].join("\n");
    expect(findUntranslatedParagraphs(source, source)).toEqual([]);
  });

  it("ignores symbol or number heavy paragraphs", () => {
    const p = "1234567890 1234567890 1234567890 1234567890 1234567890 1234567890";
    expect(findUntranslatedParagraphs(p, p)).toEqual([]);
  });

  it("handles CRLF and reports each paragraph once", () => {
    const source = `${EN}\r\n\r\n${EN}\r\n`;
    expect(findUntranslatedParagraphs(source, source)).toEqual([EN]);
  });
});

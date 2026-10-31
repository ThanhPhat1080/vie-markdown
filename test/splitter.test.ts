import { describe, expect, it } from "vitest";
import { splitMarkdown } from "../src/splitter";

const doc = [
  "# One",
  "alpha alpha alpha",
  "",
  "## Two",
  "beta beta beta",
  "",
  "## Three",
  "gamma gamma gamma",
  "",
].join("\n");

describe("splitMarkdown", () => {
  it("returns one chunk when text is shorter than maxChars", () => {
    expect(splitMarkdown(doc, 10000)).toEqual([doc]);
  });

  it("loses no characters when chunks are joined", () => {
    const chunks = splitMarkdown(doc, 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(doc);
  });

  it("splits at heading lines", () => {
    const chunks = splitMarkdown(doc, 30);
    for (const c of chunks) expect(c.startsWith("#")).toBe(true);
  });

  it('does not split at a "# " line inside a fenced code block', () => {
    const text = "# A\n```sh\n# not a heading\necho hi\n```\n# B\nbody\n";
    const chunks = splitMarkdown(text, 10);
    expect(chunks.join("")).toBe(text);
    const codeChunk = chunks.find((c) => c.includes("echo hi"))!;
    expect(codeChunk).toContain("# not a heading");
    expect(codeChunk).toContain("```sh");
  });

  it("unclosed fence at end of file: rest is kept in the last chunk, no throw", () => {
    const text = "# A\nintro\n# B\n```\n# inside\nmore\n";
    const chunks = splitMarkdown(text, 10);
    expect(chunks.join("")).toBe(text);
    expect(chunks[chunks.length - 1]).toContain("# inside");
  });

  it("CRLF input is preserved exactly", () => {
    const text = "# A\r\nline\r\n\r\n# B\r\nline\r\n";
    const chunks = splitMarkdown(text, 10);
    expect(chunks.join("")).toBe(text);
  });

  it("section longer than maxChars is split at blank lines outside fences", () => {
    const text = "# A\npara one\n\npara two\n\n```\ncode\n\nstill code\n```\n\npara three\n";
    const chunks = splitMarkdown(text, 20);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
    const codeChunk = chunks.find((c) => c.includes("code\n\nstill code"));
    expect(codeChunk).toBeDefined();
  });
});

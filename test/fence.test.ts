import { describe, expect, it } from "vitest";
import { splitMarkdown } from "../src/splitter";
import { validateTranslation } from "../src/validator";

const nestedBackticks = "# A\n````md\n```\n# not heading\n```\n````\n# B\nbody\n";
const tildeInBackticks = "# A\n```\n~~~\n# x\n~~~\n```\n# B\nbody\n";
const infoStringInside = "# A\n```\n```js\n# x\n```\n# B\nbody\n";

describe("fence tracking follows CommonMark closing rules", () => {
  it.each([
    ["4-backtick block containing ``` lines", nestedBackticks, "````md", "````\n"],
    ["~~~ lines inside a ``` block", tildeInBackticks, "```\n~~~", "~~~\n```\n"],
  ])("splitter keeps %s in one chunk", (_name, text, openMarker, closeMarker) => {
    const chunks = splitMarkdown(text, 10);
    expect(chunks.join("")).toBe(text);
    const holder = chunks.find((c) => c.includes("# not heading") || c.includes("# x"))!;
    expect(holder).toContain(openMarker);
    expect(holder).toContain(closeMarker);
  });

  it("a ```js line inside an open ``` block does not close it", () => {
    const chunks = splitMarkdown(infoStringInside, 10);
    expect(chunks.join("")).toBe(infoStringInside);
    expect(chunks.find((c) => c.includes("# x"))).toContain("```js");
  });

  it("validator counts 2 headings and 1 code block for the nested-backtick example", () => {
    const translated = "# A\n*Title: Một*\n````md\n```\n# not heading\n```\n````\n# B\n*Title: Hai*\nnội dung\n";
    expect(validateTranslation(nestedBackticks, translated)).toEqual([]);
  });

  it("validator does not treat ~~~ inside a ``` block as a new code block", () => {
    const translated = "# A\n*Title: Một*\n```\n~~~\n# x\n~~~\n```\n# B\n*Title: Hai*\nnội dung\n";
    expect(validateTranslation(tildeInBackticks, translated)).toEqual([]);
  });
});

import { FenceTracker } from "./fence";

export const MAX_CHUNK_CHARS = 30000;

const HEADING = /^#{1,6}\s/;
const BLANK = /^\s*$/;

function toLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Split into sections that each start at a heading outside a code fence. */
function splitSections(lines: string[]): string[] {
  const sections: string[] = [];
  let current = "";
  const fence = new FenceTracker();
  for (const line of lines) {
    if (!fence.inFence && HEADING.test(line) && current !== "") {
      sections.push(current);
      current = "";
    }
    fence.feed(line);
    current += line;
  }
  if (current !== "") sections.push(current);
  return sections;
}

/** Split an oversized section after blank lines that are outside code fences. */
function splitAtBlankLines(section: string): string[] {
  const pieces: string[] = [];
  let current = "";
  const fence = new FenceTracker();
  for (const line of toLines(section)) {
    fence.feed(line);
    current += line;
    if (!fence.inFence && BLANK.test(line)) {
      pieces.push(current);
      current = "";
    }
  }
  if (current !== "") pieces.push(current);
  return pieces;
}

export function splitMarkdown(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const pieces = splitSections(toLines(text)).flatMap((s) =>
    s.length > maxChars ? splitAtBlankLines(s) : [s],
  );

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current !== "" && current.length + piece.length > maxChars) {
      chunks.push(current);
      current = "";
    }
    current += piece;
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

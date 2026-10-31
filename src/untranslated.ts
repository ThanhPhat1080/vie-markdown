import { FenceTracker } from "./fence";

const MIN_CHARS = 40;
const MIN_WORDS = 6;
const MIN_LETTER_RATIO = 0.6;
const LIST_OR_QUOTE_MARKER = /^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)+/;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Lines outside code fences and YAML front-matter, trimmed, without CR. */
function proseLines(text: string): string[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) start = end + 1;
  }
  const fence = new FenceTracker();
  const out: string[] = [];
  for (const line of lines.slice(start)) {
    if (fence.feed(line) || fence.inFence) continue;
    out.push(line.trim());
  }
  return out;
}

function isEligible(unit: string): boolean {
  if (unit.length < MIN_CHARS || unit.split(" ").length < MIN_WORDS) return false;
  const letters = unit.match(/\p{L}/gu)?.length ?? 0;
  return letters / unit.length >= MIN_LETTER_RATIO;
}

/**
 * English prose lines of the source that are still present, unchanged, in the translation.
 * Skips code, headings, table rows, front-matter, short lines and symbol-heavy lines.
 */
export function findUntranslatedParagraphs(source: string, translated: string): string[] {
  const translatedText = squash(proseLines(translated).join(" "));
  const found: string[] = [];
  for (const line of proseLines(source)) {
    if (line.startsWith("#") || line.startsWith("|")) continue;
    const unit = squash(line.replace(LIST_OR_QUOTE_MARKER, ""));
    if (!isEligible(unit) || found.includes(unit)) continue;
    if (translatedText.includes(unit)) found.push(unit);
  }
  return found;
}

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^#{1,6}\s/;
const TITLE_LINE = /^\*Title: .+\*$/;
const LINK = /!?\[[^\]]*\]\([^)]*\)/g;

interface Counts {
  headings: number;
  codeBlocks: number;
  links: number;
  titleLines: number;
}

function count(text: string): Counts {
  const counts: Counts = { headings: 0, codeBlocks: 0, links: 0, titleLines: 0 };
  let inFence = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (FENCE.test(line)) {
      if (!inFence) counts.codeBlocks++;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (HEADING.test(line)) counts.headings++;
    if (TITLE_LINE.test(line)) counts.titleLines++;
    counts.links += line.match(LINK)?.length ?? 0;
  }
  return counts;
}

export function validateTranslation(source: string, translated: string): string[] {
  const src = count(source);
  const out = count(translated);
  const warnings: string[] = [];

  if (src.headings !== out.headings) {
    warnings.push(`Số tiêu đề lệch: gốc ${src.headings}, bản dịch ${out.headings}.`);
  }
  if (src.codeBlocks !== out.codeBlocks) {
    warnings.push(`Số code block lệch: gốc ${src.codeBlocks}, bản dịch ${out.codeBlocks}.`);
  }
  if (src.links !== out.links) {
    warnings.push(`Số link/ảnh lệch: gốc ${src.links}, bản dịch ${out.links}.`);
  }
  if (out.titleLines !== out.headings) {
    warnings.push(
      `Số dòng "*Title: ...*" (${out.titleLines}) không khớp số tiêu đề (${out.headings}).`,
    );
  }
  return warnings;
}

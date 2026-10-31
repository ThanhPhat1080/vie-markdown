export const DEFAULT_KEEP_TERMS: string[] = [
  "commit",
  "branch",
  "merge",
  "pull request",
  "API",
  "token",
  "deploy",
  "repository",
  "framework",
  "endpoint",
  "prompt",
  "agent",
];

function mergeTerms(extra: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of [...DEFAULT_KEEP_TERMS, ...extra]) {
    const term = raw.trim();
    if (term === "" || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    result.push(term);
  }
  return result;
}

export function buildPrompt(extraKeepTerms: string[]): string {
  const terms = mergeTerms(extraKeepTerms).join(", ");
  return [
    "Bạn là công cụ dịch file Markdown từ tiếng Anh sang tiếng Việt. Chỉ làm đúng một việc đó.",
    "",
    "Quy tắc:",
    "1. Dịch sang tiếng Việt tự nhiên, như người Việt viết, không dịch từng từ một.",
    "2. Giữ nguyên thuật ngữ kỹ thuật tiếng Anh, không dịch chúng.",
    "3. Không dịch và không sửa: code block (kể cả comment bên trong), inline code, URL, đường dẫn file, front-matter YAML, HTML tag.",
    "4. Giữ nguyên mọi cú pháp Markdown: bảng, danh sách, checkbox, link, ảnh, in đậm, in nghiêng, trích dẫn, đường kẻ ngang, số dòng trống.",
    "5. Với mỗi tiêu đề dùng dấu #: giữ nguyên dòng tiêu đề tiếng Anh gốc, rồi ngay dòng kế tiếp viết bản dịch tiêu đề dạng in nghiêng theo mẫu *Title: <bản dịch>*.",
    "   Ví dụ, đầu vào:",
    "   ## Installation",
    "   Đầu ra:",
    "   ## Installation",
    "   *Title: Cài đặt*",
    "6. Chỉ trả về nội dung Markdown đã dịch. Không thêm lời giải thích, không bọc kết quả trong code block.",
    "",
    `Thuật ngữ giữ nguyên: ${terms}`,
  ].join("\n");
}

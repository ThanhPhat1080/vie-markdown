# vie-markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extension VS Code dịch file Markdown Anh → Việt bằng Gemini, giữ nguyên định dạng, mở bản dịch ở tab nháp bên cạnh.

**Architecture:** Các hàm thuần (`splitter`, `prompt`, `validator`) và `translator` (gọi REST Gemini, có retry) được ghép bởi `pipeline` (điều phối, không phụ thuộc VS Code). `extension.ts` chỉ lo phần VS Code: lệnh, nút VIE, API key, tiến độ, mở tab nháp.

**Tech Stack:** TypeScript (CommonJS, build bằng `tsc` ra `out/`), VS Code API ^1.90, `fetch` có sẵn (Node 20), vitest cho test, `@vscode/vsce` để đóng gói `.vsix`.

**Spec:** `docs/superpowers/specs/2026-10-31-vie-markdown-design.md`

## Global Constraints

- Chỉ dịch Anh → Việt; chỉ nhà cung cấp Gemini (REST, không dùng SDK ngoài); không thêm tính năng ngoài spec mục 1.
- Thuật ngữ kỹ thuật giữ nguyên tiếng Anh; không dịch code block (kể cả comment), inline code, URL, đường dẫn, front-matter YAML, HTML tag.
- Tiêu đề `#`: giữ dòng gốc, dòng ngay dưới là `*Title: <bản dịch>*` (in nghiêng).
- Setting: `vieMarkdown.keepTerms` (mảng chuỗi), `vieMarkdown.model` (mặc định `gemini-2.5-flash`; kiểm tra model free còn hiệu lực khi triển khai).
- API key lưu bằng `SecretStorage`, không nằm trong settings.json.
- Lệnh `vie-markdown` có trong Command Palette; nút hiển thị chữ "VIE" trên `editor/title`, chỉ cho file markdown.
- Lỗi 429: chờ rồi thử lại tối đa 3 lần, thời gian chờ tăng dần; vẫn lỗi thì giữ phần đã dịch và báo người dùng.
- Validator chỉ cảnh báo, không sửa và không chặn việc mở bản dịch.
- Chuỗi giao diện bằng tiếng Việt.

## Review Focus

Các tình huống spec không nói tới nhưng dễ gặp; mỗi dòng đã có test ở task chỉ định.

1. Gemini bọc cả câu trả lời trong ```` ```markdown ... ``` ```` → phải bóc lớp bọc ngoài (Task 4).
2. Code block không đóng ở cuối file → coi phần còn lại là code, không lỗi (Task 1).
3. File dùng xuống dòng CRLF → cắt file không mất ký tự, validator đếm đúng (Task 1, 3).
4. File rỗng hoặc chỉ có khoảng trắng → không gọi API, báo "file trống" (Task 5).
5. Dòng `# ...` bên trong code block và `#hashtag` không có dấu cách sau `#` → không tính là tiêu đề (Task 3).

---

### Task 1: Khởi tạo dự án và `splitter`

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.vscodeignore`, `vitest.config.ts`
- Create: `src/splitter.ts`
- Test: `test/splitter.test.ts`

**Interfaces:**
- Produces: `splitMarkdown(text: string, maxChars: number): string[]`; `export const MAX_CHUNK_CHARS = 30000`.

- [ ] **Step 1: Khởi tạo repo và cấu hình**: `git init`; `package.json` tên `vie-markdown`, `"engines": {"vscode": "^1.90.0"}`, `"main": "./out/extension.js"`, scripts `build` (`tsc -p .`), `test` (`vitest run`); devDependencies `typescript`, `vitest`, `@types/vscode`, `@types/node`, `@vscode/vsce`. `tsconfig.json` target ES2022, module commonjs, outDir `out`, rootDir `src`, strict. `.gitignore` gồm `node_modules`, `out`, `*.vsix`. Chạy `npm install`.
- [ ] **Step 2: Viết test thất bại** trong `test/splitter.test.ts`:
  - `returns one chunk when text is shorter than maxChars`
  - `chunks.join("") === original` (không mất ký tự) với văn bản nhiều tiêu đề, maxChars nhỏ
  - `does not split at a "# " line inside a fenced code block`
  - `unclosed fence at end of file: rest is kept in the last chunk, no throw` (Review Focus 2)
  - `CRLF input is preserved exactly` (join bằng `""` bằng bản gốc; Review Focus 3)
  - `section longer than maxChars is split at blank lines outside fences`
- [ ] **Step 3: Chạy test, xác nhận thất bại**: `npx vitest run test/splitter.test.ts` → FAIL (module chưa có).
- [ ] **Step 4: Cài đặt `splitMarkdown` trong `src/splitter.ts`**: duyệt theo dòng, theo dõi trạng thái trong/ngoài fence (dòng bắt đầu bằng ``` hoặc ~~~ đảo trạng thái); chia thành các section tại dòng `^#{1,6}\s` ngoài fence; gộp tham lam các section liền kề cho tới khi vượt `maxChars`; section đơn lẻ vượt `maxChars` thì chia tiếp tại dòng trống ngoài fence. Giữ nguyên ký tự xuống dòng gốc.
- [ ] **Step 5: Chạy test, xác nhận đạt**: `npx vitest run test/splitter.test.ts` → PASS.
- [ ] **Step 6: Commit**: `git add . && git commit -m "feat: scaffold project and add markdown splitter"`

### Task 2: `prompt`

**Files:**
- Create: `src/prompt.ts`
- Test: `test/prompt.test.ts`

**Interfaces:**
- Produces: `DEFAULT_KEEP_TERMS: string[]` (gồm ít nhất `commit`, `API`, `pull request`, `token`, `deploy`); `buildPrompt(extraKeepTerms: string[]): string`.

- [ ] **Step 1: Viết test thất bại**:
  - `includes every default keep term and every extra term`
  - `includes the heading rule with the literal pattern "*Title:"`
  - `states that code blocks, inline code, URLs, paths and front-matter are not translated`
  - `deduplicates terms case-insensitively` (truyền `["API","api"]` thì `API` xuất hiện trong danh sách đúng một lần)
- [ ] **Step 2: Chạy test, xác nhận thất bại**: `npx vitest run test/prompt.test.ts` → FAIL.
- [ ] **Step 3: Cài đặt `buildPrompt` trong `src/prompt.ts`** theo đúng 6 quy tắc ở spec mục 3 (kể cả ví dụ tiêu đề `## Installation` → `*Title: Cài đặt*`); danh sách thuật ngữ = `DEFAULT_KEEP_TERMS` ∪ `extraKeepTerms`, bỏ chuỗi rỗng, bỏ trùng không phân biệt hoa thường.
- [ ] **Step 4: Chạy test, xác nhận đạt**: PASS.
- [ ] **Step 5: Commit**: `git add src/prompt.ts test/prompt.test.ts && git commit -m "feat: add translation prompt builder"`

### Task 3: `validator`

**Files:**
- Create: `src/validator.ts`
- Test: `test/validator.test.ts`

**Interfaces:**
- Produces: `validateTranslation(source: string, translated: string): string[]` (danh sách cảnh báo tiếng Việt; rỗng nghĩa là khớp).

- [ ] **Step 1: Viết test thất bại**:
  - `returns [] for a faithful translation` (nguồn có 2 tiêu đề, 1 code block, 1 link; bản dịch đủ cả 2 dòng `*Title: ...*`)
  - `warns when heading count differs`
  - `warns when code block count differs`
  - `warns when link or image count differs`
  - `warns when number of "*Title:" lines differs from number of headings`
  - `ignores "# " lines inside fenced code blocks` (Review Focus 5)
  - `does not count "#hashtag" (no space after #) as a heading` (Review Focus 5)
  - `works with CRLF line endings` (Review Focus 3)
- [ ] **Step 2: Chạy test, xác nhận thất bại**: FAIL.
- [ ] **Step 3: Cài đặt `validateTranslation` trong `src/validator.ts`**: đếm tiêu đề (`^#{1,6}\s` ngoài fence), số fence mở, số link/ảnh (`\[[^\]]*\]\([^)]*\)`), số dòng khớp `^\*Title: .+\*$` trong bản dịch phải bằng số tiêu đề của bản dịch. Mỗi chỉ số lệch tạo một cảnh báo nêu số gốc và số dịch.
- [ ] **Step 4: Chạy test, xác nhận đạt**: PASS.
- [ ] **Step 5: Commit**: `git add src/validator.ts test/validator.test.ts && git commit -m "feat: add translation validator"`

### Task 4: `translator`

**Files:**
- Create: `src/translator.ts`
- Test: `test/translator.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class TranslationError extends Error { constructor(message: string, readonly kind: "auth" | "rate_limit" | "network" | "empty" | "other") }
  export interface TranslatorOptions { apiKey: string; model: string; systemPrompt: string; fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void> }
  export function translateChunk(text: string, opts: TranslatorOptions): Promise<string>
  ```

- [ ] **Step 1: Viết test thất bại** (mock `fetchFn` và `sleep`):
  - `sends POST to https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent with header x-goog-api-key and systemInstruction + user text`
  - `returns concatenated text of candidates[0].content.parts`
  - `retries on 429 up to 3 times with increasing sleep, then throws TranslationError kind "rate_limit"`
  - `succeeds when a retry after 429 returns 200`
  - `401/403 throws kind "auth"` (không retry)
  - `empty candidates (safety block) throws kind "empty"`
  - `fetch rejection throws kind "network"`
  - `strips a single outer \`\`\`markdown fence wrapping the whole response` (Review Focus 1), nhưng không đụng code block nằm bên trong nội dung
- [ ] **Step 2: Chạy test, xác nhận thất bại**: FAIL.
- [ ] **Step 3: Cài đặt `translateChunk` và `TranslationError` trong `src/translator.ts`**: mặc định `fetchFn = fetch`, `sleep = setTimeout` bọc Promise; thời gian chờ 2s, 4s, 8s giữa các lần thử lại 429.
- [ ] **Step 4: Chạy test, xác nhận đạt**: PASS.
- [ ] **Step 5: Commit**: `git add src/translator.ts test/translator.test.ts && git commit -m "feat: add Gemini translator with retry"`

### Task 5: `pipeline`

**Files:**
- Create: `src/pipeline.ts`
- Test: `test/pipeline.test.ts`

**Interfaces:**
- Consumes: `splitMarkdown`, `validateTranslation`, `TranslationError`.
- Produces:
  ```ts
  export interface PipelineDeps { translate: (chunk: string) => Promise<string>; maxChars: number; onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean }
  export interface PipelineResult { text: string; warnings: string[]; completed: boolean; error?: string }
  export function translateDocument(source: string, deps: PipelineDeps): Promise<PipelineResult>
  ```

- [ ] **Step 1: Viết test thất bại** (translate giả):
  - `whitespace-only source returns completed:false, error "File trống" and never calls translate` (Review Focus 4)
  - `translates chunks in order, trims each result's trailing whitespace and joins with a blank line`
  - `calls onProgress(done,total) after each chunk`
  - `when translate throws on chunk 2 of 3: returns text of chunk 1, completed:false, error set from the message`
  - `when isCancelled becomes true after chunk 1: stops, returns chunk 1, completed:false, no error`
  - `runs validateTranslation on full result and returns its warnings when completed`
- [ ] **Step 2: Chạy test, xác nhận thất bại**: FAIL.
- [ ] **Step 3: Cài đặt `translateDocument` trong `src/pipeline.ts`**: không import `vscode`. Khi lỗi, `error` lấy từ `TranslationError.message` hoặc `String(e)`.
- [ ] **Step 4: Chạy toàn bộ test**: `npx vitest run` → tất cả PASS.
- [ ] **Step 5: Commit**: `git add src/pipeline.ts test/pipeline.test.ts && git commit -m "feat: add translation pipeline"`

### Task 6: Tích hợp VS Code, README, đóng gói

**Files:**
- Modify: `package.json` (thêm `contributes`)
- Create: `src/extension.ts`, `README.md`

**Interfaces:**
- Consumes: `translateDocument`, `translateChunk`, `buildPrompt`, `MAX_CHUNK_CHARS`.
- Produces: `activate(context: vscode.ExtensionContext)`, `deactivate()`.

- [ ] **Step 1: Khai báo `contributes` trong `package.json`**:
  - Lệnh `vieMarkdown.translate`: title `vie-markdown: Dịch file Markdown sang tiếng Việt`, `shortTitle` `VIE`.
  - Lệnh `vieMarkdown.setApiKey`: title `vie-markdown: Đặt API key Gemini`.
  - `menus.editor/title`: lệnh `vieMarkdown.translate`, `when: "resourceLangId == markdown"`, `group: "navigation"`.
  - `configuration`: `vieMarkdown.keepTerms` (array of string, mặc định `[]`) và `vieMarkdown.model` (string, mặc định `gemini-2.5-flash`).
- [ ] **Step 2: Cài đặt `src/extension.ts`**:
  - `vieMarkdown.translate`: lấy editor đang mở (không phải markdown thì báo lỗi); lấy key từ `context.secrets` (khóa `vieMarkdown.geminiKey`), chưa có thì hỏi bằng `showInputBox({password:true})` kèm gợi ý link https://aistudio.google.com/apikey rồi lưu; chạy `translateDocument` trong `withProgress` (có `cancellable`, báo "phần x/y"); mở `workspace.openTextDocument({language:"markdown", content})` bằng `showTextDocument` với `ViewColumn.Beside`.
  - Lỗi `auth` thì xóa key đã lưu và hỏi lại ở lần chạy sau. Có `warnings` hoặc `error` thì hiện `showWarningMessage` (nêu rõ phần nào đã dịch được).
  - `vieMarkdown.setApiKey`: hỏi và ghi đè key.
- [ ] **Step 3: Build**: `npm run build` → không lỗi.
- [ ] **Step 4: Chạy thử tay (F5, Extension Development Host) với key Gemini thật**: mở một file `.md` có tiêu đề, bảng, code block có dòng `# comment`, link. Kỳ vọng: nút VIE hiện trên tiêu đề editor; `Ctrl+Shift+P` gõ `vie-markdown` ra lệnh; tab nháp bên cạnh có `## Tiêu đề` kèm dòng `*Title: ...*`; code block nguyên vẹn; thuật ngữ trong `keepTerms` không bị dịch; mở file `.txt` thì không thấy nút; nhập key sai thì báo lỗi và hỏi lại.
- [ ] **Step 5: Viết `README.md`**: cách lấy key tại Google AI Studio, cách dùng, hai setting, và mục **Quyền riêng tư**: nội dung file được gửi tới Google, gói free có thể được dùng để cải thiện sản phẩm nên không dùng cho file nhạy cảm; hạn mức free do Google quy định, xem trang chính thức.
- [ ] **Step 6: Đóng gói**: `npx vsce package` → tạo `vie-markdown-0.0.1.vsix`; cài thử bằng `code --install-extension vie-markdown-0.0.1.vsix` và lặp lại một lần chạy dịch.
- [ ] **Step 7: Commit**: `git add . && git commit -m "feat: wire up VS Code extension, docs and packaging"`

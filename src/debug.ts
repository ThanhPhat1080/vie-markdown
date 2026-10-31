/**
 * Debug CLI (not part of the extension). Build with `npm run build`, then:
 *   node out/debug.js markdown.mock.md --dry
 *   GEMINI_API_KEY=... node out/debug.js --list-models
 *   GEMINI_API_KEY=... node out/debug.js markdown.mock.md [--model NAME] [--out FILE]
 * The key is read from the environment only and never printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { extractGenerateModels, parseDebugArgs } from "./debug-helpers";
import { translateDocument } from "./pipeline";
import { buildPrompt } from "./prompt";
import { MAX_CHUNK_CHARS, splitMarkdown } from "./splitter";
import { translateChunk } from "./translator";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const log = (msg: string) => console.log(msg);

async function listModels(apiKey: string): Promise<void> {
  log(`GET ${BASE}/models?pageSize=200`);
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey } });
  const text = await res.text();
  log(`→ HTTP ${res.status}`);
  if (!res.ok) {
    log(text.slice(0, 800));
    process.exitCode = 1;
    return;
  }
  const names = extractGenerateModels(JSON.parse(text));
  log(`Key này gọi được generateContent với ${names.length} model:`);
  for (const n of names) log(`  ${n}`);
  log("\nĐặt một trong các tên trên vào setting vieMarkdown.model (ưu tiên dòng có 'flash').");
}

const loggingFetch: typeof fetch = async (input, init) => {
  const started = Date.now();
  log(`POST ${String(input)}`);
  const res = await fetch(input, init);
  log(`→ HTTP ${res.status} (${Date.now() - started} ms)`);
  if (!res.ok) log(`  body: ${(await res.clone().text()).slice(0, 800)}`);
  return res;
};

async function main(): Promise<void> {
  const args = parseDebugArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY;

  if (args.listModels) {
    if (!apiKey) return fail("Thiếu biến môi trường GEMINI_API_KEY.");
    return listModels(apiKey);
  }
  if (!args.file) return fail("Cách dùng: node out/debug.js <file.md> [--dry] [--model NAME] [--out FILE] | --list-models");

  const source = readFileSync(args.file, "utf8");
  const chunks = splitMarkdown(source, MAX_CHUNK_CHARS);
  const systemPrompt = buildPrompt([]);
  log(`File: ${args.file} (${source.length} ký tự, ${source.split("\n").length} dòng)`);
  log(`Cắt thành ${chunks.length} phần: ${chunks.map((c) => c.length).join(", ")} ký tự`);
  log(`Model: ${args.model} | prompt hệ thống: ${systemPrompt.length} ký tự`);

  if (args.dry) {
    log("\n--dry: không gọi mạng. Prompt hệ thống:\n");
    log(systemPrompt);
    return;
  }
  if (!apiKey) return fail("Thiếu biến môi trường GEMINI_API_KEY (hoặc dùng --dry).");

  const result = await translateDocument(source, {
    maxChars: MAX_CHUNK_CHARS,
    onProgress: (done, total) => log(`Xong phần ${done}/${total}`),
    translate: (chunk) =>
      translateChunk(chunk, { apiKey, model: args.model, systemPrompt, fetchFn: loggingFetch }),
  });

  const out = args.out ?? args.file.replace(/\.md$/i, "") + ".vi.md";
  if (result.text !== "") {
    writeFileSync(out, result.text + "\n");
    log(`Đã ghi bản dịch: ${out}`);
  }
  if (result.error) {
    log(`LỖI: ${result.error}`);
    process.exitCode = 1;
  }
  for (const w of result.warnings) log(`CẢNH BÁO: ${w}`);
  if (result.completed && result.warnings.length === 0) log("Hoàn tất, validator không thấy lệch định dạng.");
}

function fail(msg: string): void {
  console.error(msg);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

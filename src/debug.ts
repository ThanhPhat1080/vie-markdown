/**
 * Debug CLI (not part of the extension). Build with `npm run build`, then:
 *   node out/debug.js markdown.mock.md --dry
 *   node out/debug.js --list-models [--provider gemini|groq]
 *   node out/debug.js markdown.mock.md [--provider gemini|groq] [--model NAME] [--limit N] [--out FILE]
 * Keys come from the environment or a .env in the current directory
 * (GEMINI_API_KEY / GROQ_API_KEY); they are never printed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dotenvKey, parseDotenv } from "./dotenv";
import { extractGenerateModels, extractGroqChatModels, parseDebugArgs } from "./debug-helpers";
import { DEFAULT_GROQ_MODEL, translateChunkGroq } from "./groq";
import { translateDocument } from "./pipeline";
import { buildPrompt } from "./prompt";
import { MAX_CHUNK_CHARS, splitMarkdown } from "./splitter";
import { translateChunk } from "./translator";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

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

async function listGroqModels(apiKey: string): Promise<void> {
  const url = "https://api.groq.com/openai/v1/models";
  log(`GET ${url}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await res.text();
  log(`→ HTTP ${res.status}`);
  if (!res.ok) {
    log(text.slice(0, 800));
    process.exitCode = 1;
    return;
  }
  const names = extractGroqChatModels(JSON.parse(text));
  log(`Key này dùng được ${names.length} model chat trên Groq:`);
  for (const n of names) log(`  ${n}`);
  log("\nThử: node out/debug.js <file.md> --provider groq --model <tên> --limit 1500");
  log("Đặt tên chọn vào setting vieMarkdown.groqModel (ưu tiên model nhỏ như 8b, instant, scout, 20b).");
}

const loggingFetch: typeof fetch = async (input, init) => {
  const started = Date.now();
  log(`POST ${String(input).replace(/\?.*$/, "")}`);
  const res = await fetch(input, init);
  log(`→ HTTP ${res.status} (${Date.now() - started} ms)`);
  if (!res.ok) log(`  body: ${(await res.clone().text()).slice(0, 800)}`);
  return res;
};

async function main(): Promise<void> {
  const args = parseDebugArgs(process.argv.slice(2));
  const dotenv = existsSync(".env") ? parseDotenv(readFileSync(".env", "utf8")) : {};
  const keyName = args.provider === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY";
  const apiKey = process.env[keyName]?.trim() || dotenvKey(args.provider, dotenv);
  const model = args.model ?? (args.provider === "groq" ? DEFAULT_GROQ_MODEL : DEFAULT_GEMINI_MODEL);

  if (args.listModels) {
    if (!apiKey) return fail(`Thiếu ${keyName} (biến môi trường hoặc .env).`);
    return args.provider === "groq" ? listGroqModels(apiKey) : listModels(apiKey);
  }
  if (!args.file) return fail("Cách dùng: node out/debug.js <file.md> [--dry] [--provider gemini|groq] [--model NAME] [--limit N] [--out FILE] | --list-models");

  let source = readFileSync(args.file, "utf8");
  if (args.limit && source.length > args.limit) {
    // cut at a line boundary so the sample stays valid Markdown
    const cut = source.lastIndexOf("\n", args.limit);
    source = source.slice(0, cut > 0 ? cut + 1 : args.limit);
    log(`--limit ${args.limit}: chỉ dịch ${source.length} ký tự đầu để thử nhanh`);
  }
  const chunks = splitMarkdown(source, MAX_CHUNK_CHARS);
  const systemPrompt = buildPrompt([]);
  log(`File: ${args.file} (${source.length} ký tự, ${source.split("\n").length} dòng)`);
  log(`Cắt thành ${chunks.length} phần: ${chunks.map((c) => c.length).join(", ")} ký tự`);
  log(`Provider: ${args.provider} | Model: ${model} | prompt hệ thống: ${systemPrompt.length} ký tự`);

  if (args.dry) {
    log("\n--dry: không gọi mạng. Prompt hệ thống:\n");
    log(systemPrompt);
    return;
  }
  if (!apiKey) return fail(`Thiếu ${keyName} (biến môi trường hoặc .env; hoặc dùng --dry).`);

  const translateOne = args.provider === "groq" ? translateChunkGroq : translateChunk;
  const result = await translateDocument(source, {
    maxChars: MAX_CHUNK_CHARS,
    onProgress: (done, total) => log(`Xong phần ${done}/${total}`),
    translate: (chunk) =>
      translateOne(chunk, { apiKey, model, systemPrompt, fetchFn: loggingFetch }),
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

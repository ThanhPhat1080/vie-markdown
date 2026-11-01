// Throwaway diagnostic: find which part of the translate request makes Gemini hang.
// Usage: GEMINI_API_KEY=... node scripts/probe.mjs [model] [file.md]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPrompt } = require("../out/prompt.js");

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY đang trống. Hãy đặt biến này trong terminal rồi chạy lại.");
  process.exit(1);
}
const model = process.argv[2] ?? "gemini-3.5-flash-lite";
const file = process.argv[3] ?? "markdown.mock.md";
const sample = readFileSync(file, "utf8").slice(0, 515);
const ourPrompt = buildPrompt([]);
const shortPrompt = "Translate to Vietnamese. Keep all Markdown syntax unchanged.";

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const only = (process.env.ONLY ?? "1,2,3,4,5").split(",");

async function run(id, name, system, text, generationConfig) {
  if (!only.includes(id)) return;
  const body = { contents: [{ role: "user", parts: [{ text }] }] };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (generationConfig) body.generationConfig = generationConfig;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(70_000),
    });
    const raw = await res.text();
    let out = raw.slice(0, 200);
    try {
      const j = JSON.parse(raw);
      out = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? raw.slice(0, 300);
      const u = j.usageMetadata;
      if (u) out += `\n   tokens: prompt=${u.promptTokenCount} output=${u.candidatesTokenCount} thoughts=${u.thoughtsTokenCount ?? 0} finishReason=${j.candidates?.[0]?.finishReason}`;
    } catch {}
    console.log(`${name}: HTTP ${res.status} sau ${Date.now() - started} ms\n   ${String(out).slice(0, 300).replace(/\n/g, "\n   ")}`);
  } catch (e) {
    console.log(`${name}: LỖI sau ${Date.now() - started} ms — ${e.name}: ${e.message}`);
  }
}

console.log(`Model: ${model}, mẫu: ${sample.length} ký tự\n`);
await run("1", "1. không prompt hệ thống, 'Say hi'", null, "Say hi");
await run("2", "2. prompt của extension, 'Say hi'", ourPrompt, "Say hi");
await run("3", "3. prompt ngắn + mẫu 515 ký tự", shortPrompt, sample);
await run("4", "4. prompt của extension + mẫu 515 ký tự", ourPrompt, sample);
await run("5", "5. như 4 nhưng giới hạn đầu ra 1500 token", ourPrompt, sample, { maxOutputTokens: 1500 });

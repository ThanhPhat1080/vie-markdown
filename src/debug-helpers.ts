export type DebugProvider = "gemini" | "groq";

export interface DebugArgs {
  file?: string;
  provider: DebugProvider;
  /** Undefined means: the provider's default model. */
  model?: string;
  listModels: boolean;
  dry: boolean;
  out?: string;
  limit?: number;
}

export function parseDebugArgs(argv: string[]): DebugArgs {
  const args: DebugArgs = { provider: "gemini", listModels: false, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") {
      const v = argv[++i];
      if (v !== "gemini" && v !== "groq") throw new Error(`--provider phải là gemini hoặc groq (nhận: ${v})`);
      args.provider = v;
    } else if (a === "--model") args.model = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--list-models") args.listModels = true;
    else if (a === "--dry") args.dry = true;
    else if (!a.startsWith("--") && args.file === undefined) args.file = a;
  }
  return args;
}

/** Model ids (without the "models/" prefix) that support generateContent, sorted. */
export function extractGenerateModels(body: unknown): string[] {
  const models = (body as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  return models
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => String(m.name).replace(/^models\//, ""))
    .sort();
}

/** Groq model ids that look usable for chat (active, not speech/audio/safety models), sorted. */
export function extractGroqChatModels(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((m) => m?.active !== false && !/whisper|tts|guard|playai|orpheus|embed/i.test(String(m?.id)))
    .map((m) => String(m.id))
    .sort();
}

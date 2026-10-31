export interface DebugArgs {
  file?: string;
  model: string;
  listModels: boolean;
  dry: boolean;
  out?: string;
  limit?: number;
}

export function parseDebugArgs(argv: string[]): DebugArgs {
  const args: DebugArgs = { model: "gemini-3.5-flash-lite", listModels: false, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") args.model = argv[++i];
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

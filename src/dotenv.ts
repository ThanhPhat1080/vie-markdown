import type { Provider } from "./translator";

const KEY_NAMES: Record<Provider, string[]> = {
  gemini: ["GEMINI_API_KEY"],
  groq: ["GROQ_API_KEY"],
};

/** Minimal KEY=VALUE parser: skips blanks and # comments, accepts `export`, strips matching quotes. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[name] = value;
  }
  return out;
}

export function dotenvKey(provider: Provider, env: Record<string, string>): string | undefined {
  for (const name of KEY_NAMES[provider]) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

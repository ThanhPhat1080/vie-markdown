import type { Provider } from "./translator";

export interface ProviderChoice {
  provider: Provider;
  label: string;
  description: string;
}

const NAME: Record<Provider, string> = { gemini: "Gemini", groq: "Groq" };

export const providerName = (p: Provider): string => NAME[p];

export interface ChoiceInput {
  models: Record<Provider, string>;
  hasKey: Record<Provider, boolean>;
  /** Provider used last time; listed first so Enter repeats it. */
  last?: Provider;
}

export function buildProviderChoices({ models, hasKey, last }: ChoiceInput): ProviderChoice[] {
  const order: Provider[] = last === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];
  return order.map((provider) => ({
    provider,
    label: `${NAME[provider]} · ${models[provider]}`,
    description: hasKey[provider] ? "" : "chưa có API key",
  }));
}

/**
 * `dev` (from .env, development host only) wins for manual testing; then the setting;
 * the SecretStorage value is what earlier versions stored.
 */
export function pickApiKey(
  setting: string | undefined,
  secret: string | undefined,
  dev?: string,
): string | undefined {
  return dev?.trim() || setting?.trim() || secret?.trim() || undefined;
}

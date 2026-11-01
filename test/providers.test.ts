import { describe, expect, it } from "vitest";
import { buildProviderChoices, pickApiKey } from "../src/providers";

const base = {
  models: { gemini: "gem-1", groq: "llama-1" },
  hasKey: { gemini: true, groq: false },
};

describe("buildProviderChoices", () => {
  it("lists Gemini then Groq with their models by default", () => {
    const c = buildProviderChoices(base);
    expect(c.map((x) => x.provider)).toEqual(["gemini", "groq"]);
    expect(c.map((x) => x.label)).toEqual(["Gemini · gem-1", "Groq · llama-1"]);
  });

  it("puts the last used provider first", () => {
    expect(buildProviderChoices({ ...base, last: "groq" }).map((x) => x.provider)).toEqual(["groq", "gemini"]);
  });

  it("marks a provider without a key", () => {
    const c = buildProviderChoices(base);
    expect(c[0].description).toBe("");
    expect(c[1].description).toContain("chưa có API key");
  });
});

describe("pickApiKey", () => {
  it("prefers the setting, trimmed", () => {
    expect(pickApiKey("  S ", "old")).toBe("S");
  });
  it("falls back to the stored secret when the setting is blank", () => {
    expect(pickApiKey("  ", "old")).toBe("old");
    expect(pickApiKey(undefined, "old")).toBe("old");
  });
  it("is undefined when neither exists", () => {
    expect(pickApiKey("", undefined)).toBeUndefined();
  });
});

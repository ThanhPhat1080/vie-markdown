import { describe, expect, it } from "vitest";
import { extractGenerateModels, extractGroqChatModels, parseDebugArgs } from "../src/debug-helpers";

describe("parseDebugArgs", () => {
  it("defaults to provider gemini with no model override, no flags", () => {
    expect(parseDebugArgs(["a.md"])).toEqual({
      file: "a.md",
      provider: "gemini",
      listModels: false,
      dry: false,
    });
  });

  it("reads --model, --list-models and --dry", () => {
    const args = parseDebugArgs(["a.md", "--model", "gemini-3.6-flash", "--dry"]);
    expect(args.model).toBe("gemini-3.6-flash");
    expect(args.dry).toBe(true);
    expect(parseDebugArgs(["--list-models"]).listModels).toBe(true);
  });

  it("reads --limit as a number of characters", () => {
    expect(parseDebugArgs(["a.md", "--limit", "600"]).limit).toBe(600);
    expect(parseDebugArgs(["a.md"]).limit).toBeUndefined();
  });

  it("reads --out", () => {
    expect(parseDebugArgs(["a.md", "--out", "b.md"]).out).toBe("b.md");
  });
});

describe("extractGenerateModels", () => {
  it("keeps only models that support generateContent, strips the models/ prefix and sorts", () => {
    const body = {
      models: [
        { name: "models/gemini-b", supportedGenerationMethods: ["generateContent", "countTokens"] },
        { name: "models/embed-x", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] },
      ],
    };
    expect(extractGenerateModels(body)).toEqual(["gemini-a", "gemini-b"]);
  });

  it("returns [] for an unexpected body", () => {
    expect(extractGenerateModels({})).toEqual([]);
    expect(extractGenerateModels(null)).toEqual([]);
  });
});

describe("parseDebugArgs --provider", () => {
  it("accepts groq", () => {
    expect(parseDebugArgs(["a.md", "--provider", "groq"]).provider).toBe("groq");
  });
  it("rejects unknown providers", () => {
    expect(() => parseDebugArgs(["--provider", "x"])).toThrow(/gemini hoặc groq/);
  });
});

describe("extractGroqChatModels", () => {
  it("keeps active chat models, drops speech/safety ones, sorts", () => {
    const body = {
      data: [
        { id: "z-chat", active: true },
        { id: "whisper-large-v3", active: true },
        { id: "a-chat" },
        { id: "old-chat", active: false },
        { id: "some-guard-model", active: true },
      ],
    };
    expect(extractGroqChatModels(body)).toEqual(["a-chat", "z-chat"]);
  });
  it("returns [] for an unexpected body", () => {
    expect(extractGroqChatModels(null)).toEqual([]);
  });
});

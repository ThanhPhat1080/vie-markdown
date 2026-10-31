import { describe, expect, it } from "vitest";
import { extractGenerateModels, parseDebugArgs } from "../src/debug-helpers";

describe("parseDebugArgs", () => {
  it("defaults to model gemini-3.8-flash, no flags", () => {
    expect(parseDebugArgs(["a.md"])).toEqual({
      file: "a.md",
      model: "gemini-3.8-flash",
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

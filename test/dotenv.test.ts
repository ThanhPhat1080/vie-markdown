import { describe, expect, it } from "vitest";
import { dotenvKey, parseDotenv } from "../src/dotenv";
import { pickApiKey } from "../src/providers";

describe("parseDotenv", () => {
  it("parses KEY=VALUE lines, ignoring comments and blanks", () => {
    expect(parseDotenv("# c\n\nA=1\n  B = two  \n")).toEqual({ A: "1", B: "two" });
  });
  it("strips export and matching quotes, keeps = inside values", () => {
    expect(parseDotenv('export A="x y"\nB=\'z\'\nC=a=b\r\n')).toEqual({ A: "x y", B: "z", C: "a=b" });
  });
  it("skips lines without a name", () => {
    expect(parseDotenv("=v\nnoequals")).toEqual({});
  });
});

describe("dotenvKey", () => {
  it("reads GEMINI_API_KEY and GROQ_API_KEY", () => {
    expect(dotenvKey("gemini", { GEMINI_API_KEY: "g" })).toBe("g");
    expect(dotenvKey("groq", { GROQ_API_KEY: "q" })).toBe("q");
  });
  it("ignores blanks, other names and the other provider's key", () => {
    expect(dotenvKey("groq", { GROQ_API_KEY: " " })).toBeUndefined();
    expect(dotenvKey("groq", { GROQ: "short", GEMINI_API_KEY: "g" })).toBeUndefined();
    expect(dotenvKey("gemini", {})).toBeUndefined();
  });
});

describe("pickApiKey with a dev key", () => {
  it("dev key wins over setting and secret", () => {
    expect(pickApiKey("S", "old", "DEV")).toBe("DEV");
    expect(pickApiKey("S", "old", undefined)).toBe("S");
  });
});

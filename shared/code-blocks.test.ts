import { describe, expect, it } from "vitest";
import { runnableBlock, runnableBlocks } from "./code-blocks";
import { inlineRunKey } from "./contracts";
describe("parsed executable blocks", () => {
  it("normalizes supported languages and prompts without parsing Markdown", () => {
    expect(runnableBlock("$ echo hello\n$ pwd", "CONSOLE")).toEqual({
      lang: "console",
      code: "echo hello\npwd",
    });
    expect(runnableBlock("print('Привіт')", "python")).toEqual({
      lang: "python",
      code: "print('Привіт')",
    });
  });
  it("rejects empty, unsupported, and oversized blocks", () => {
    expect(runnableBlock("{}", "json")).toBeNull();
    expect(runnableBlock("  ", "bash")).toBeNull();
    expect(runnableBlock("a".repeat(8001), "bash")).toBeNull();
  });
  it("keeps the old Markdown scan for legacy clients", () => {
    expect(runnableBlocks("```bash\necho old\n```\n\n```json\n{}\n```")).toEqual([
      { lang: "bash", code: "echo old" },
    ]);
  });
  it("scopes stable keys to host, agent, message, and the absolute fence index", () => {
    const first = inlineRunKey("h", "a", "m", 1);
    expect(inlineRunKey("h", "a", "m", 1)).toBe(first);
    expect(
      new Set([
        first,
        inlineRunKey("h2", "a", "m", 1),
        inlineRunKey("h", "a2", "m", 1),
        inlineRunKey("h", "a", "m2", 1),
        inlineRunKey("h", "a", "m", 2),
      ]).size,
    ).toBe(5);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { PluginHandlerContext, PluginLifecycleEvents } from "@getpaseo/plugin/server";
import { appendCardForTurn } from "../server/cards";
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
  it("fetches the latest reply when a completed turn has an empty event timeline", async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn().mockResolvedValue({
      entries: [{ item: { type: "assistant_message", text: "```bash\necho test\n```" } }],
    });
    const paseo = {
      agents: { ref: () => ({ timeline: { refetch, append } }) },
    } as unknown as PluginHandlerContext["paseo"];
    const event = {
      agent: {
        id: "agent-1",
        workspaceId: null,
        parentAgentId: null,
        provider: "pi",
        cwd: "/tmp",
        title: null,
      },
      turnId: null,
      outcome: { kind: "completed" },
      timeline: [],
    } satisfies PluginLifecycleEvents["agent.turn_ended"];
    await appendCardForTurn(paseo, event);
    expect(refetch).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "terminal-run-card",
        data: expect.objectContaining({
          origin: "reply",
          blocks: [{ lang: "bash", code: "echo test" }],
        }),
      }),
    );
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

import { defineAttachmentSource, defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const TERMINAL_NAME = "Agent commands";

export function inlineRunKey(
  hostId: string,
  agentId: string,
  messageId: string,
  blockIndex: number,
): string {
  return JSON.stringify([hostId, agentId, messageId, blockIndex]);
}

// COMPAT(legacyRunCards): added in the inline-actions fork, remove after 2027-04-01.
export const RUN_CARD_KIND = "terminal-run-card";
export const RUN_CARD_VERSION = 1;

export const runCardSchema = z.object({
  cardId: z.string(),
  blocks: z.array(z.object({ lang: z.string(), code: z.string() })),
});
export type RunCardData = z.output<typeof runCardSchema>;

export function runKey(cardId: string, blockIndex: number): string {
  return `${cardId}:${blockIndex}`;
}

/** `terminal` types the block into "Agent commands"; `background` runs it with no terminal and no stdin. */
export const runModes = ["terminal", "background"] as const;
export type RunMode = (typeof runModes)[number];

export const runSnapshotSchema = z.object({
  runId: z.string(),
  workspaceId: z.string(),
  terminalId: z.string().nullable(),
  key: z.string(),
  mode: z.enum(runModes),
  status: z.enum(["queued", "running", "done", "canceled", "failed"]),
  exitCode: z.number().int().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  lineCount: z.number().int(),
  tail: z.array(z.string()),
  sendOnFinish: z.boolean(),
  sending: z.boolean(),
  sent: z.boolean(),
  error: z.string().nullable(),
});
export type RunSnapshot = z.output<typeof runSnapshotSchema>;

export const startRun = defineRpc({
  name: "run.start",
  input: z.object({
    agentId: z.string(),
    key: z.string(),
    lang: z.string(),
    code: z.string().min(1).max(8_000),
    send: z.boolean(),
    mode: z.enum(runModes),
  }),
  output: runSnapshotSchema,
});

export const runStatus = defineRpc({
  name: "run.status",
  input: z.object({ keys: z.array(z.string()) }),
  output: z.object({ runs: z.array(runSnapshotSchema) }),
});

export const cancelRun = defineRpc({
  name: "run.cancel",
  input: z.object({ key: z.string() }),
  output: runSnapshotSchema.nullable(),
});

export const sendRunOutput = defineRpc({
  name: "run.send",
  input: z.object({ key: z.string() }),
  output: runSnapshotSchema.nullable(),
});

export const runAdhoc = defineRpc({
  name: "run.adhoc",
  input: z.object({ agentId: z.string(), command: z.string().min(1) }),
  output: z.object({ cardId: z.string() }),
});

export const scanBlocks = defineRpc({
  name: "blocks.scan",
  input: z.object({ agentId: z.string() }),
  output: z.object({ count: z.number().int() }),
});

export const enableLegacyCards = defineRpc({
  name: "legacy.cards.enable",
  input: z.object({}),
  output: z.object({ enabled: z.boolean() }),
});

export const searchTerminalOutput = defineRpc({
  name: "terminals.search",
  input: z.object({ query: z.string() }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        subtitle: z.string().optional(),
        url: z.string().url(),
        text: z.string(),
        resourceType: z.string(),
      }),
    ),
  }),
});

export const terminalOutputSource = defineAttachmentSource({
  id: "terminal-output",
  title: "Terminal output",
  icon: "SquareTerminal",
  pickerTitle: "Attach terminal output",
  searchPlaceholder: "Filter by name or path; add a number for line count (e.g. build 500)",
  search: searchTerminalOutput,
});

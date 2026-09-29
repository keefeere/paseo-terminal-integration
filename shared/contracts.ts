import { defineAttachmentSource, defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { openTerminalOptions } from "./settings";

export const TERMINAL_NAME = "Agent commands";

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

export const runSnapshotSchema = z.object({
  runId: z.string(),
  key: z.string(),
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
    code: z.string().min(1),
    send: z.boolean(),
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
  output: z.object({ cardId: z.string(), openTerminal: z.enum(openTerminalOptions) }),
});

const terminalSize = { rows: z.number().int().min(2).max(500), cols: z.number().int().min(10).max(1000) };

export const openTerminalView = defineRpc({
  name: "view.open",
  input: z.object({ terminalId: z.string(), ...terminalSize }),
  output: z.object({ viewId: z.string() }),
});

/** Long-polls for terminal output after `cursor`, which acknowledges everything before it. */
export const readTerminalView = defineRpc({
  name: "view.read",
  input: z.object({ viewId: z.string(), cursor: z.number().int().nonnegative() }),
  output: z.object({ data: z.string(), cursor: z.number().int(), closed: z.string().nullable() }),
});

export const resizeTerminalView = defineRpc({
  name: "view.resize",
  input: z.object({ viewId: z.string(), ...terminalSize }),
  output: z.object({}),
});

export const closeTerminalView = defineRpc({
  name: "view.close",
  input: z.object({ viewId: z.string() }),
  output: z.object({}),
});

export const scanBlocks = defineRpc({
  name: "blocks.scan",
  input: z.object({ agentId: z.string() }),
  output: z.object({ count: z.number().int() }),
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

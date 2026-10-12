import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { CLIENT_SERVER_INSTRUCTIONS, LOCAL_DAEMON_INSTRUCTIONS } from "./instructions";

export const instructionTopologies = ["local-daemon", "client-server"] as const;
export type InstructionTopology = (typeof instructionTopologies)[number];
export const DEFAULT_COLLAPSE_OUTPUT_AFTER_LINES = 20;

export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 3,
  schema: z.object({
    /** Initial state of a code block's "Send output to agent" checkbox. */
    sendToAgent: z.boolean().default(true),
    /** Automatically collapse a sent run report when its output exceeds this many lines; 0 disables. */
    collapseOutputAfterLines: z
      .number()
      .int()
      .min(0)
      .max(5_000)
      .default(DEFAULT_COLLAPSE_OUTPUT_AFTER_LINES),
    /** Add command-formatting and execution-topology guidance to newly created agents. */
    injectCommandInstructions: z.boolean().default(false),
    instructionTopology: z.enum(instructionTopologies).default("client-server"),
    localDaemonInstructions: z.string().default(LOCAL_DAEMON_INSTRUCTIONS),
    clientServerInstructions: z.string().default(CLIENT_SERVER_INSTRUCTIONS),
  }),
  migrate(values) {
    return values;
  },
});

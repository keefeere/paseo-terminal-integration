import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { CLIENT_SERVER_INSTRUCTIONS, LOCAL_DAEMON_INSTRUCTIONS } from "./instructions";

export const instructionTopologies = ["local-daemon", "client-server"] as const;
export type InstructionTopology = (typeof instructionTopologies)[number];

export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 2,
  schema: z.object({
    /** Initial state of a code block's "Send output to agent" checkbox. */
    sendToAgent: z.boolean().default(true),
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

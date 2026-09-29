import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const TERMINAL_PANEL_ID = "terminal";

export const openTerminalOptions = ["explorer", "workspace", "off"] as const;
export type OpenTerminalOption = (typeof openTerminalOptions)[number];

export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: z.object({
    /** Where to show the terminal panel when a run starts from a wide window. */
    openTerminal: z.enum(openTerminalOptions).default("explorer"),
  }),
});

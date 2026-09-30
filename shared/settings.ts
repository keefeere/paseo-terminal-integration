import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const TERMINAL_PANEL_ID = "terminal";

export const panelLocations = ["explorer", "workspace"] as const;
export type PanelLocation = (typeof panelLocations)[number];

export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: z.object({
    /** Where "Run in side terminal", the Terminal button, and /run show the terminal panel. */
    panelLocation: z.enum(panelLocations).default("explorer"),
    /** Initial state of a run card's "Send to agent" checkbox. */
    sendToAgent: z.boolean().default(true),
  }),
});

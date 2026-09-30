import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: z.object({
    /** Initial state of a run card's "Send output to agent" checkbox. */
    sendToAgent: z.boolean().default(true),
  }),
});

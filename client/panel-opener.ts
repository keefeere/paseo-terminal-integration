import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TERMINAL_PANEL_ID, type OpenTerminalOption } from "../shared/settings";

type OpenPanel = PluginClientContext["openPanel"];

// Timeline renderers receive no navigation, so the entry hands its openPanel capability here.
let openPanel: OpenPanel | null = null;

export function setPanelOpener(next: OpenPanel | null): void {
  openPanel = next;
}

/**
 * Shows the terminal panel. Compact layouts have no Explorer, so they use a workspace tab and
 * only when asked explicitly: an automatic tab switch would hide the chat on a phone.
 */
export function openTerminalPanel(
  workspaceId: string,
  where: OpenTerminalOption,
  { compact, explicit }: { compact: boolean; explicit: boolean },
): void {
  if (!openPanel || where === "off") return;
  if (compact && !explicit) return;
  const location = compact || where === "workspace" ? "workspace" : "explorer";
  try {
    openPanel(TERMINAL_PANEL_ID, { workspaceId, location });
  } catch {
    if (location === "explorer") openPanel(TERMINAL_PANEL_ID, { workspaceId, location: "workspace" });
  }
}

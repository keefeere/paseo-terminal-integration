import type { PluginClientContext } from "@getpaseo/plugin/client";
import { setPanelOpener } from "./client/panel-opener";
import { RunCard } from "./client/run-card";
import { SettingsScreen } from "./client/settings-screen";
import { TerminalPanel } from "./client/terminal-panel";
import {
  RUN_CARD_KIND,
  RUN_CARD_VERSION,
  runAdhoc,
  runCardSchema,
  scanBlocks,
  TERMINAL_NAME,
  terminalOutputSource,
} from "./shared/contracts";
import { TERMINAL_PANEL_ID } from "./shared/settings";

export default function contribute(client: PluginClientContext) {
  setPanelOpener((id, options) => client.openPanel(id, options));

  client.addTimelineRenderer({
    kind: RUN_CARD_KIND,
    version: RUN_CARD_VERSION,
    schema: runCardSchema,
    Component: RunCard,
  });

  client.addWorkspacePanel({
    id: TERMINAL_PANEL_ID,
    title: TERMINAL_NAME,
    icon: "SquareTerminal",
    context: "workspace",
    locations: ["explorer", "workspace"],
    Component: TerminalPanel,
  });

  client.addSettingsScreen({
    id: "preferences",
    title: "Terminal integration",
    icon: "SquareTerminal",
    Component: SettingsScreen,
  });

  client.addAttachmentSource(terminalOutputSource);

  client.addSlashCommand({
    name: "run",
    description: "Run a shell command in the workspace terminal and send its output to the agent",
    argumentHint: "<command>",
    context: "agent",
    async onSubmit({ args, agent, rpc, openPanel }) {
      if (!args) throw new Error("Usage: /run <command>");
      const { openTerminal } = await rpc(runAdhoc, { agentId: agent.id, command: args });
      if (openTerminal === "off") return;
      try {
        openPanel(TERMINAL_PANEL_ID, { location: openTerminal });
      } catch {
        // Compact layouts have no Explorer; the card's Terminal button still opens a tab.
      }
    },
  });

  async function addRunButtons(agentId: string, rpc: PluginClientContext["rpc"]) {
    const { count } = await rpc(scanBlocks, { agentId });
    if (count === 0) throw new Error("The latest reply has no runnable code blocks");
  }

  client.addSlashCommand({
    name: "blocks",
    description: "Add terminal run buttons for code blocks in the agent's latest reply",
    argumentHint: "",
    context: "agent",
    onSubmit: ({ agent, rpc }) => addRunButtons(agent.id, rpc),
  });

  client.addCommandCenterItem({
    id: "scan-latest-reply",
    title: "Terminal: add run buttons to the latest reply",
    icon: "SquareTerminal",
    keywords: ["run", "code block", "terminal", "execute"],
    context: "agent",
    onSelect: ({ agent, rpc }) => addRunButtons(agent.id, rpc),
  });

  client.addCommandCenterItem({
    id: "open-terminal-panel",
    title: `Terminal: show "${TERMINAL_NAME}" in the side panel`,
    icon: "PanelRight",
    keywords: ["terminal", "explorer", "sidebar", "agent commands"],
    context: "workspace",
    onSelect({ openPanel }) {
      try {
        openPanel(TERMINAL_PANEL_ID, { location: "explorer" });
      } catch {
        openPanel(TERMINAL_PANEL_ID, { location: "workspace" });
      }
    },
  });

  return () => setPanelOpener(null);
}

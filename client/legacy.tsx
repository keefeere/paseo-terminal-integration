import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RunCard } from "./run-card";
import {
  enableLegacyCards,
  RUN_CARD_KIND,
  RUN_CARD_VERSION,
  runAdhoc,
  runCardSchema,
  scanBlocks,
} from "../shared/contracts";

// A function declaration: the host reads the default export before the module body has run.
export function contributeLegacy(client: PluginClientContext): PluginCleanup {
  // COMPAT(legacyRunCards): added in the inline-actions fork, remove after 2027-04-01.
  void client
    .rpc(enableLegacyCards, {})
    .catch((error) => console.error("Could not enable legacy terminal cards", error));
  client.addTimelineRenderer({
    kind: RUN_CARD_KIND,
    version: RUN_CARD_VERSION,
    schema: runCardSchema,
    Component: RunCard,
  });

  client.addSlashCommand({
    name: "run",
    description: "Run a shell command in the workspace terminal and send its output to the agent",
    argumentHint: "<command>",
    context: "agent",
    async onSubmit({ args, agent, rpc }) {
      if (!args) throw new Error("Usage: /run <command>");
      await rpc(runAdhoc, { agentId: agent.id, command: args });
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

  return () => {};
}

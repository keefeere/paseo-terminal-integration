import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RunCard } from "./client/run-card";
import {
  RUN_CARD_KIND,
  RUN_CARD_VERSION,
  runAdhoc,
  runCardSchema,
  scanBlocks,
  terminalOutputSource,
} from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: RUN_CARD_KIND,
    version: RUN_CARD_VERSION,
    schema: runCardSchema,
    Component: RunCard,
  });

  client.addAttachmentSource(terminalOutputSource);

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

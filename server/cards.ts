import { randomUUID } from "node:crypto";
import type { PluginHandlerContext, PluginLifecycleEvents } from "@getpaseo/plugin/server";
import { runnableBlocks, type CodeBlock } from "../shared/code-blocks";
import { RUN_CARD_KIND, RUN_CARD_VERSION, type RunCardData } from "../shared/contracts";

type Paseo = PluginHandlerContext["paseo"];
type TimelineItem = PluginLifecycleEvents["agent.turn_ended"]["timeline"][number];

const MAX_CARD_BYTES = 60 * 1024;
const SCAN_LIMIT = 400;

/**
 * Assistant text after the latest user message. Consecutive assistant items are stream chunks of
 * one message; any other item between them separates messages.
 */
export function latestAssistantText(timeline: readonly TimelineItem[]): string {
  let text = "";
  let previous: TimelineItem["type"] | null = null;
  for (const item of timeline) {
    if (item.type === "user_message") {
      text = "";
    } else if (item.type === "assistant_message") {
      if (previous !== "assistant_message" && text) text += "\n\n";
      text += item.text;
    }
    previous = item.type;
  }
  return text;
}

export async function appendRunCard(
  paseo: Paseo,
  agentId: string,
  blocks: CodeBlock[],
): Promise<string | null> {
  const fitting: CodeBlock[] = [];
  for (const block of blocks) {
    const data: RunCardData = { cardId: "", blocks: [...fitting, block] };
    if (JSON.stringify(data).length > MAX_CARD_BYTES) break;
    fitting.push(block);
  }
  if (fitting.length === 0) return null;

  const cardId = randomUUID();
  const data: RunCardData = { cardId, blocks: fitting };
  await paseo.agents.ref(agentId).timeline.append({
    type: "plugin",
    id: cardId,
    kind: RUN_CARD_KIND,
    version: RUN_CARD_VERSION,
    data,
  });
  return cardId;
}

export async function appendCardForTurn(
  paseo: Paseo,
  event: PluginLifecycleEvents["agent.turn_ended"],
): Promise<void> {
  if (event.outcome.kind !== "completed") return;
  const blocks = runnableBlocks(latestAssistantText(event.timeline));
  if (blocks.length > 0) await appendRunCard(paseo, event.agent.id, blocks);
}

/** Re-scans the latest reply, for conversations that predate the plugin. */
export async function scanLatestReply(paseo: Paseo, agentId: string): Promise<number> {
  const page = await paseo.agents
    .ref(agentId)
    .timeline.refetch({ direction: "tail", limit: SCAN_LIMIT, projection: "projected" });
  if (page.error) throw new Error(page.error);
  const blocks = runnableBlocks(latestAssistantText(page.entries.map((entry) => entry.item)));
  if (blocks.length === 0) return 0;
  await appendRunCard(paseo, agentId, blocks);
  return blocks.length;
}

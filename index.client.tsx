import { contributeLegacy } from "./client/legacy";
import type { PluginCleanup } from "@getpaseo/plugin";
import type { InlineActionsClient } from "./client/sdk-compat";
import { CodeBlockActions } from "./client/code-block-actions";
import { hideRunReport } from "./client/hide-run-report";
import { SettingsScreen } from "./client/settings-screen";
import { RUNNABLE_LANGUAGES } from "./shared/code-blocks";
import {
  RUN_CARD_KIND,
  RUN_CARD_VERSION,
  runCardSchema,
  terminalOutputSource,
  type RunCardData,
} from "./shared/contracts";
import { RunCard } from "./client/run-card";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";

function CommandRunCard(props: PluginTimelineItemProps<RunCardData>) {
  return props.item.data.origin === "command" ? <RunCard {...props} /> : null;
}

export default function contribute(client: InlineActionsClient): PluginCleanup {
  client.addTimelineTransformer({
    id: "terminal-run-report",
    query: { itemType: "user_message" },
    transform: hideRunReport,
  });
  if (typeof client.addCodeBlockActions === "function") {
    client.addCodeBlockActions({
      id: "run",
      languages: RUNNABLE_LANGUAGES,
      Component: CodeBlockActions,
    });
    // Inline buttons already cover agent replies, so only /run cards render here.
    client.addTimelineRenderer({
      kind: RUN_CARD_KIND,
      version: RUN_CARD_VERSION,
      schema: runCardSchema,
      Component: CommandRunCard,
    });
  } else {
    contributeLegacy(client);
  }
  client.addSettingsScreen({
    id: "preferences",
    title: "Terminal integration",
    icon: "SquareTerminal",
    Component: SettingsScreen,
  });
  client.addAttachmentSource(terminalOutputSource);
  return () => {};
}

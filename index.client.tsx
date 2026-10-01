import { z } from "zod";
import { contributeLegacy } from "./client/legacy";
import type { PluginCleanup } from "@getpaseo/plugin";
import type { InlineActionsClient } from "./client/sdk-compat";
import { CodeBlockActions } from "./client/code-block-actions";
import { SettingsScreen } from "./client/settings-screen";
import { RUNNABLE_LANGUAGES } from "./shared/code-blocks";
import { terminalOutputSource } from "./shared/contracts";

export default function contribute(client: InlineActionsClient): PluginCleanup {
  if (typeof client.addCodeBlockActions === "function") {
    client.addCodeBlockActions({
      id: "run",
      languages: RUNNABLE_LANGUAGES,
      Component: CodeBlockActions,
    });
    // COMPAT(legacyRunCards): added in the inline-actions fork, remove after 2027-04-01.
    client.addTimelineRenderer({
      kind: "terminal-run-card",
      version: 1,
      schema: z.unknown(),
      Component: () => null,
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

// COMPAT(inlineCodeBlockActions): copies of the inline code-action SDK types until a published
// @getpaseo/plugin exports them; remove after 2027-04-01.
import type { ComponentType } from "react";
import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext, PluginSurfaceProps } from "@getpaseo/plugin/client";

type HostNavigation = NonNullable<PluginSurfaceProps["navigation"]>;

export interface PluginCodeBlockActionsProps extends Omit<PluginSurfaceProps, "navigation"> {
  readonly navigation?: HostNavigation & {
    readonly openTerminal?: (input: {
      readonly workspaceId: string;
      readonly terminalId: string;
      readonly serverId?: string;
    }) => void;
  };
  agentId: string;
  messageId: string;
  blockIndex: number;
  code: string;
  language: string;
  phase: "streaming" | "complete";
}

export interface PluginCodeBlockActionsContribution {
  id: string;
  languages: readonly string[];
  Component: ComponentType<PluginCodeBlockActionsProps>;
}

/** Older clients lack addCodeBlockActions; check for it before calling. */
export type InlineActionsClient = PluginClientContext & {
  addCodeBlockActions?: (contribution: PluginCodeBlockActionsContribution) => PluginCleanup;
};

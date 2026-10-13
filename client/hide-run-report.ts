import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { RUN_REPORT_MARKER } from "../shared/run-report";

type UserMessageTransformer = PluginTimelineTransformerContribution<"user_message">["transform"];

/** Keep the full report available to the agent without repeating it in the visible timeline. */
export const hideRunReport: UserMessageTransformer = ({ item }) => {
  if (item.text === RUN_REPORT_MARKER || item.text.startsWith(`${RUN_REPORT_MARKER}\n`)) {
    return { items: [] };
  }
};

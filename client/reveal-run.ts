import type { PluginCodeBlockActionsProps } from "./sdk-compat";
import type { RunSnapshot } from "../shared/contracts";

type OpenTerminal = NonNullable<PluginCodeBlockActionsProps["navigation"]>["openTerminal"];
/** Called only by the initiating click; history mounts never acquire navigation intent. */
export async function revealStartedRun(
  started: RunSnapshot,
  openTerminal: OpenTerminal,
  status: (input: { keys: string[] }) => Promise<{ runs: RunSnapshot[] }>,
): Promise<void> {
  if (started.mode !== "terminal") return;
  if (!openTerminal)
    throw new Error("Command started. Update Paseo to open its terminal automatically.");
  let run = started;
  while (!run.terminalId) {
    if (run.status !== "queued" && run.status !== "running") return;
    await new Promise((resolve) => setTimeout(resolve, 700));
    const current = (await status({ keys: [run.key] })).runs[0];
    if (!current || current.runId !== started.runId) return;
    run = current;
  }
  if (run.status === "canceled" || run.status === "failed") return;
  openTerminal({ workspaceId: run.workspaceId, terminalId: run.terminalId });
}

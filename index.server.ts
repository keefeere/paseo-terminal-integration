import type { PluginServerContext } from "@getpaseo/plugin/server";
import { searchTerminals } from "./server/attachments";
import { appendCardForTurn, appendRunCard, scanLatestReply } from "./server/cards";
import { cleanupScripts, TerminalRunner } from "./server/runner";
import { TerminalStreams } from "./server/streams";
import { preferences } from "./shared/settings";
import {
  cancelRun,
  closeTerminalView,
  openTerminalView,
  readTerminalView,
  resizeTerminalView,
  runAdhoc,
  runKey,
  runStatus,
  scanBlocks,
  searchTerminalOutput,
  sendRunOutput,
  startRun,
} from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  let runner: TerminalRunner | null = null;
  const streams = new TerminalStreams();
  const runnerFor = (paseo: ConstructorParameters<typeof TerminalRunner>[0]) =>
    (runner ??= new TerminalRunner(paseo));

  server.on("agent.turn_ended", (event, { paseo }) => appendCardForTurn(paseo, event));

  server.handle(startRun, (input, { paseo }) => runnerFor(paseo).start(input));
  server.handle(runStatus, ({ keys }, { paseo }) => ({ runs: runnerFor(paseo).status(keys) }));
  server.handle(cancelRun, ({ key }, { paseo }) => runnerFor(paseo).cancel(key));
  server.handle(sendRunOutput, ({ key }, { paseo }) => runnerFor(paseo).sendOutput(key));

  server.handle(runAdhoc, async ({ agentId, command }, { paseo }) => {
    const block = { lang: "bash", code: command };
    const cardId = await appendRunCard(paseo, agentId, [block]);
    if (!cardId) throw new Error("Command is too long");
    await runnerFor(paseo).start({ agentId, key: runKey(cardId, 0), ...block, send: true });
    const saved = await settings.read();
    return { cardId, panelLocation: saved.status === "ready" ? saved.values.panelLocation : "explorer" };
  });

  server.handle(scanBlocks, async ({ agentId }, { paseo }) => ({
    count: await scanLatestReply(paseo, agentId),
  }));

  server.handle(searchTerminalOutput, searchTerminals);

  server.handle(openTerminalView, (input) => streams.open(input));
  server.handle(readTerminalView, (input) => streams.read(input));
  server.handle(resizeTerminalView, (input) => streams.resize(input));
  server.handle(closeTerminalView, (input) => streams.close(input));

  return async () => {
    runner?.stop();
    await streams.stop();
    await cleanupScripts();
  };
}

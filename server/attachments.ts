import { pathToFileURL } from "node:url";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { searchTerminalOutput } from "../shared/contracts";
import { fenced, trimBlankEdges, withoutRunMarkers } from "../shared/text";

const DEFAULT_LINES = 200;
const MAX_LINES = 2_000;
const MAX_RESULTS = 20;

/** Lists every terminal on the daemon with a snapshot of its latest lines. */
export async function searchTerminals(
  { query }: RpcInput<typeof searchTerminalOutput>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof searchTerminalOutput>> {
  const { lineCount, filter } = parseQuery(query);
  const [{ entries }, workspaces] = await Promise.all([
    paseo.terminals.list(),
    paseo.workspaces.list().catch(() => null),
  ]);
  const workspaceNames = new Map(
    (workspaces?.entries ?? []).map((workspace) => [workspace.id, workspace.name]),
  );

  const matches = entries
    .filter((entry) => {
      if (!filter) return true;
      const haystack = `${entry.name} ${entry.cwd} ${workspaceNames.get(entry.workspaceId) ?? ""}`;
      return haystack.toLowerCase().includes(filter);
    })
    .slice(0, MAX_RESULTS);

  const items = await Promise.all(
    matches.map(async (entry) => {
      const capture = await paseo.terminals.ref(entry).capture({ start: -lineCount, stripAnsi: true });
      const lines = trimBlankEdges(withoutRunMarkers(capture.lines));
      const name = entry.name || "Terminal";
      const workspace = workspaceNames.get(entry.workspaceId);
      return {
        id: `${entry.id}:${lineCount}`,
        identifier: name,
        title: `${name} · last ${lines.length} lines`,
        subtitle: workspace ? `${workspace} · ${entry.cwd}` : entry.cwd,
        url: pathToFileURL(entry.cwd).href,
        resourceType: "terminal-output",
        text: [
          `Output of the Paseo terminal "${name}" (cwd \`${entry.cwd}\`), last ${lines.length} lines:`,
          "",
          fenced(lines.join("\n"), "text"),
        ].join("\n"),
      };
    }),
  );
  return { items };
}

function parseQuery(query: string): { lineCount: number; filter: string } {
  const number = /(?:^|\s)(\d{1,5})(?:\s|$)/.exec(query);
  const lineCount = number ? Math.min(MAX_LINES, Math.max(1, Number(number[1]))) : DEFAULT_LINES;
  const filter = (number ? query.replace(number[0], " ") : query).trim().toLowerCase();
  return { lineCount, filter };
}

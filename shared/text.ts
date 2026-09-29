/** A Markdown fence long enough that no backtick run inside `content` can close it. */
export function fenced(content: string, lang = ""): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${content}\n${fence}`;
}

/** Matches the run markers the runner prints, concealed, around command output. */
export const RUN_MARKER = /__PTI_(?:BEGIN_[0-9a-f]+|END_[0-9a-f]+_\d+)__/g;

/** Removes the run markers from captured lines. */
export function withoutRunMarkers(lines: readonly string[]): string[] {
  return lines
    .filter((line) => !/^\s*__PTI_BEGIN_[0-9a-f]+__\s*$/.test(line))
    .map((line) => line.replace(RUN_MARKER, ""));
}

export function trimBlankEdges(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end).map((line) => line.replace(/\s+$/, ""));
}

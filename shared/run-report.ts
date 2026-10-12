import { z } from "zod";
import { fenced } from "./text";

export const RUN_REPORT_MARKER = "[paseo-terminal-integration-report]: # (v1)";

export const runReportSchema = z.object({
  intro: z.string(),
  language: z.string(),
  code: z.string(),
  outputLabel: z.string(),
  output: z.string(),
  outputLineCount: z.number().int().nonnegative(),
});

export type RunReportData = z.output<typeof runReportSchema>;

export function wrapRunReportOutcome(intro: string): string {
  const splitAt = intro.lastIndexOf("), ");
  return splitAt < 0 ? intro : `${intro.slice(0, splitAt + 1)}\n${intro.slice(splitAt + 3)}`;
}

export function formatRunReport(data: Omit<RunReportData, "outputLineCount">): string {
  return [
    RUN_REPORT_MARKER,
    "",
    data.intro,
    "",
    fenced(data.code, data.language),
    "",
    data.outputLabel,
    ...(data.output ? ["", fenced(data.output, "text")] : []),
  ].join("\n");
}

export function parseRunReport(text: string): RunReportData | null {
  const lines = text.split("\n");
  if (lines[0] !== RUN_REPORT_MARKER) return null;

  let cursor = skipBlankLines(lines, 1);
  const intro = lines[cursor++];
  if (!intro) return null;

  cursor = skipBlankLines(lines, cursor);
  const command = parseFence(lines, cursor);
  if (!command) return null;

  cursor = skipBlankLines(lines, command.next);
  const outputLabel = lines[cursor++];
  if (!outputLabel) return null;

  cursor = skipBlankLines(lines, cursor);
  let output = "";
  if (cursor < lines.length) {
    const outputFence = parseFence(lines, cursor);
    if (!outputFence || outputFence.language !== "text") return null;
    output = outputFence.content;
    cursor = skipBlankLines(lines, outputFence.next);
  }
  if (cursor !== lines.length) return null;

  return {
    intro,
    language: command.language,
    code: command.content,
    outputLabel,
    output,
    outputLineCount: output ? output.split("\n").length : 0,
  };
}

function skipBlankLines(lines: readonly string[], from: number): number {
  let cursor = from;
  while (cursor < lines.length && lines[cursor] === "") cursor++;
  return cursor;
}

function parseFence(
  lines: readonly string[],
  from: number,
): { language: string; content: string; next: number } | null {
  const match = /^(`{3,})([^`]*)$/.exec(lines[from] ?? "");
  if (!match) return null;
  const fence = match[1];
  const language = match[2].trim();
  const end = lines.indexOf(fence, from + 1);
  if (end < 0) return null;
  return { language, content: lines.slice(from + 1, end).join("\n"), next: end + 1 };
}

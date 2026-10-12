import { describe, expect, it } from "vitest";
import {
  formatRunReport,
  parseRunReport,
  RUN_REPORT_MARKER,
  wrapRunReportOutcome,
} from "./run-report";

describe("terminal run reports", () => {
  it("round-trips code, dynamic fences, and output", () => {
    const text = formatRunReport({
      intro: "I ran this in the terminal, exit code 0:",
      language: "bash",
      code: "printf '```inside```'",
      outputLabel: "Output:",
      output: "one\ntwo\nthree",
    });

    expect(text.startsWith(RUN_REPORT_MARKER)).toBe(true);
    expect(parseRunReport(text)).toEqual({
      intro: "I ran this in the terminal, exit code 0:",
      language: "bash",
      code: "printf '```inside```'",
      outputLabel: "Output:",
      output: "one\ntwo\nthree",
      outputLineCount: 3,
    });
  });

  it("parses an empty-output report and ignores normal user messages", () => {
    const text = formatRunReport({
      intro: "I ran this in the background, exit code 0:",
      language: "bash",
      code: "true",
      outputLabel: "It printed no output.",
      output: "",
    });

    expect(parseRunReport(text)?.outputLineCount).toBe(0);
    expect(parseRunReport("ordinary message")).toBeNull();
  });

  it("moves the outcome onto a second line for an expanded report", () => {
    expect(wrapRunReportOutcome('I ran this in "Agent commands" (cwd `/tmp`), exit code 0:')).toBe(
      'I ran this in "Agent commands" (cwd `/tmp`)\nexit code 0:',
    );
    expect(wrapRunReportOutcome("Unexpected format")).toBe("Unexpected format");
  });
});

import { describe, expect, it } from "vitest";
import { CLIENT_SERVER_INSTRUCTIONS, LOCAL_DAEMON_INSTRUCTIONS } from "../shared/instructions";
import { injectCommandInstructions, selectedCommandInstructions } from "./instructions";

const base = {
  injectCommandInstructions: true,
  instructionTopology: "client-server" as const,
  localDaemonInstructions: LOCAL_DAEMON_INSTRUCTIONS,
  clientServerInstructions: CLIENT_SERVER_INSTRUCTIONS,
};

describe("command instruction injection", () => {
  it("selects only the configured topology", () => {
    expect(selectedCommandInstructions(base)).toBe(CLIENT_SERVER_INSTRUCTIONS);
    expect(selectedCommandInstructions({ ...base, instructionTopology: "local-daemon" })).toBe(
      LOCAL_DAEMON_INSTRUCTIONS,
    );
  });

  it("stays disabled and ignores blank custom text", () => {
    expect(selectedCommandInstructions({ ...base, injectCommandInstructions: false })).toBeNull();
    expect(selectedCommandInstructions({ ...base, clientServerInstructions: "  " })).toBeNull();
  });

  it("preserves an existing system prompt and injects once", () => {
    const first = injectCommandInstructions("Existing guidance", "Command guidance");
    expect(first).toContain("Existing guidance\n\n<paseo-terminal-integration-command-guidance>");
    expect(injectCommandInstructions(first, "Different guidance")).toBe(first);
  });
});

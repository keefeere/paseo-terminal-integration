import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIENT_SERVER_INSTRUCTIONS, LOCAL_DAEMON_INSTRUCTIONS } from "./instructions";

function shipped(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../instructions/${name}.md`, import.meta.url)),
    "utf8",
  ).trim();
}

describe("shipped command instructions", () => {
  it("keeps the local-daemon template in sync with the default", () => {
    expect(shipped("local-daemon")).toBe(LOCAL_DAEMON_INSTRUCTIONS);
  });

  it("keeps the client-server template in sync with the default", () => {
    expect(shipped("client-server")).toBe(CLIENT_SERVER_INSTRUCTIONS);
  });
});

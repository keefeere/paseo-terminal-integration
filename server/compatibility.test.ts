import { expect, it, vi } from "vitest";
import type { PluginServerContext } from "@getpaseo/plugin/server";
vi.mock("./cards", () => ({
  appendCardForTurn: vi.fn(),
  appendRunCard: vi.fn(),
  scanLatestReply: vi.fn(),
}));
import { appendCardForTurn } from "./cards";
import contribute from "../index.server";
import { CLIENT_SERVER_INSTRUCTIONS, INSTRUCTION_PROMPT_MARKER } from "../shared/instructions";
it("does not scan modern-only conversations; legacy opt-in enables the old hook", async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  let beforeAgentCreate: (...args: unknown[]) => unknown = () => {
    throw new Error("before hook missing");
  };
  let turnEnded: (...args: unknown[]) => unknown = () => {
    throw new Error("hook missing");
  };
  const server = {
    registerSettings() {
      return {
        read: vi.fn().mockResolvedValue({
          status: "ready",
          revision: "1",
          values: {
            sendToAgent: true,
            injectCommandInstructions: true,
            instructionTopology: "client-server",
            localDaemonInstructions: "local",
            clientServerInstructions: CLIENT_SERVER_INSTRUCTIONS,
          },
        }),
      };
    },
    before(event: string, handler: (...args: unknown[]) => unknown) {
      if (event === "agent.create") beforeAgentCreate = handler;
    },
    handle(contract: { name: string }, handler: (...args: unknown[]) => unknown) {
      handlers.set(contract.name, handler);
    },
    on(_event: string, handler: (...args: unknown[]) => unknown) {
      turnEnded = handler;
    },
  } as unknown as PluginServerContext;
  contribute(server);
  await turnEnded({}, { paseo: {} });
  expect(appendCardForTurn).not.toHaveBeenCalled();
  await handlers.get("legacy.cards.enable")!();
  await turnEnded({}, { paseo: {} });
  expect(appendCardForTurn).toHaveBeenCalledTimes(1);

  const request = await beforeAgentCreate({ request: { config: { systemPrompt: "Base" } } });
  expect(request).toMatchObject({
    config: { systemPrompt: expect.stringContaining(INSTRUCTION_PROMPT_MARKER) },
  });
});

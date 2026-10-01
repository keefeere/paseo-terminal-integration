import { describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
vi.mock("@getpaseo/plugin/client", () => ({ useRpc: vi.fn(), useSettings: vi.fn() }));
vi.mock("@getpaseo/plugin/client/react-native", () => ({
  copyText: vi.fn(),
  Icon: () => null,
  useToast: vi.fn(),
}));
vi.mock("@getpaseo/plugin/client/ui", () => ({
  SettingsCard: () => null,
  SettingsRow: () => null,
  SettingsSection: () => null,
  SettingsSwitch: () => null,
}));
vi.mock("react-native", () => ({
  Platform: { select: (values: Record<string, string>) => values.default },
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));
import contribute from "../index.client";
describe("old and new Paseo clients", () => {
  function client(modern: boolean) {
    const methods = {
      addCodeBlockActions: modern ? vi.fn() : undefined,
      addTimelineRenderer: vi.fn(),
      addSettingsScreen: vi.fn(),
      addAttachmentSource: vi.fn(),
      addSlashCommand: vi.fn(),
      addCommandCenterItem: vi.fn(),
      rpc: vi.fn(async (_contract: { name: string }, _input: unknown) => ({ enabled: true })),
    };
    return { methods, context: methods as unknown as PluginClientContext };
  }
  it("registers inline actions without activating scans on new clients", () => {
    const { methods, context } = client(true);
    expect(typeof contribute(context)).toBe("function");
    expect(methods.addCodeBlockActions).toHaveBeenCalledTimes(1);
    expect(methods.rpc).not.toHaveBeenCalled();
    expect(methods.addSlashCommand).not.toHaveBeenCalled();
    expect(methods.addTimelineRenderer.mock.calls[0][0].Component()).toBeNull();
  });
  it("retains cards, /run, /blocks and activates scans on old clients", async () => {
    const { methods, context } = client(false);
    contribute(context);
    await Promise.resolve();
    expect(methods.rpc.mock.calls[0][0].name).toBe("legacy.cards.enable");
    expect(methods.addSlashCommand.mock.calls.map(([command]) => command.name)).toEqual([
      "run",
      "blocks",
    ]);
    expect(methods.addTimelineRenderer.mock.calls[0][0].kind).toBe("terminal-run-card");
    expect(methods.addSettingsScreen).toHaveBeenCalledTimes(1);
    expect(methods.addAttachmentSource).toHaveBeenCalledTimes(1);
  });
});

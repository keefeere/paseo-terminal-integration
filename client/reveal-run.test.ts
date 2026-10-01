import { afterEach, describe, expect, it, vi } from "vitest";
import { revealStartedRun } from "./reveal-run";
import type { RunSnapshot } from "../shared/contracts";
const queued: RunSnapshot = {
  runId: "run-1",
  key: "block-1",
  workspaceId: "ws",
  terminalId: null,
  mode: "terminal",
  status: "queued",
  exitCode: null,
  startedAt: null,
  finishedAt: null,
  lineCount: 0,
  tail: [],
  sendOnFinish: false,
  sending: false,
  sent: false,
  error: null,
};
afterEach(() => vi.useRealTimers());
describe("navigation owned by a run click", () => {
  it("waits for a queued terminal and reveals it once", async () => {
    vi.useFakeTimers();
    const open = vi.fn();
    const status = vi
      .fn()
      .mockResolvedValueOnce({ runs: [queued] })
      .mockResolvedValueOnce({ runs: [{ ...queued, status: "running", terminalId: "term" }] });
    const result = revealStartedRun(queued, open, status);
    expect(open).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1400);
    await result;
    expect(open.mock.calls).toEqual([[{ workspaceId: "ws", terminalId: "term" }]]);
  });
  it("never polls or navigates for a background run", async () => {
    const open = vi.fn();
    const status = vi.fn();
    await revealStartedRun({ ...queued, mode: "background" }, open, status);
    expect(open).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
  it.each(["canceled", "failed"] as const)("does not reveal a %s run", async (state) => {
    const open = vi.fn();
    await revealStartedRun({ ...queued, status: state, terminalId: "term" }, open, vi.fn());
    expect(open).not.toHaveBeenCalled();
  });
  it("abandons stale intent if the run was replaced", async () => {
    vi.useFakeTimers();
    const open = vi.fn();
    const result = revealStartedRun(queued, open, async () => ({
      runs: [{ ...queued, runId: "run-2", terminalId: "term" }],
    }));
    await vi.advanceTimersByTimeAsync(700);
    await result;
    expect(open).not.toHaveBeenCalled();
  });
  it("reports navigation failure without resubmitting the command", async () => {
    const open = vi.fn(() => {
      throw new Error("workspace unavailable");
    });
    await expect(
      revealStartedRun({ ...queued, terminalId: "term", status: "running" }, open, vi.fn()),
    ).rejects.toThrow("workspace unavailable");
    expect(open).toHaveBeenCalledTimes(1);
  });
});

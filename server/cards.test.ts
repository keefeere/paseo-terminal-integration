import { expect, it, vi } from "vitest";
import { appendCardForTurn } from "./cards";

type Paseo = Parameters<typeof appendCardForTurn>[0];
type TurnEnded = Parameters<typeof appendCardForTurn>[1];

function fakePaseo(items: unknown[]) {
  const append = vi.fn().mockResolvedValue(undefined);
  const refetch = vi.fn().mockResolvedValue({ entries: items.map((item) => ({ item })) });
  const paseo = { agents: { ref: () => ({ timeline: { append, refetch } }) } } as unknown as Paseo;
  return { paseo, append, refetch };
}

const REPLY = [
  { type: "user_message", text: "first question" },
  { type: "assistant_message", text: "```bash\necho old\n```" },
  { type: "user_message", text: "second question" },
  { type: "assistant_message", text: "```bash\necho new\n```" },
];

function turnEnded(timeline: unknown[], kind = "completed"): TurnEnded {
  return { agent: { id: "agent-1" }, outcome: { kind }, timeline } as unknown as TurnEnded;
}

it("reads the reply back when the turn event carries an empty timeline", async () => {
  const { paseo, append, refetch } = fakePaseo(REPLY);
  await appendCardForTurn(paseo, turnEnded([]));
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(append).toHaveBeenCalledTimes(1);
  expect(append.mock.calls[0][0].data.blocks).toEqual([{ lang: "bash", code: "echo new" }]);
});

it("uses the timeline from the turn event when it has items", async () => {
  const { paseo, append, refetch } = fakePaseo([]);
  await appendCardForTurn(paseo, turnEnded(REPLY));
  expect(refetch).not.toHaveBeenCalled();
  expect(append.mock.calls[0][0].data.blocks).toEqual([{ lang: "bash", code: "echo new" }]);
});

it("adds no card for a turn that did not complete", async () => {
  const { paseo, append, refetch } = fakePaseo(REPLY);
  await appendCardForTurn(paseo, turnEnded([], "failed"));
  expect(refetch).not.toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
});

import { describe, expect, it } from "vitest";
import { boundedOutput } from "./runner";

describe("bounded run output", () => {
  it("keeps the newest lines in their original order", () => {
    expect(boundedOutput(["one", "two", "three", "four"], 3, 100)).toEqual([
      "two",
      "three",
      "four",
    ]);
  });

  it("keeps the end of the newest line when the character limit is reached", () => {
    expect(boundedOutput(["old", "0123456789"], 10, 5)).toEqual(["56789"]);
  });
});

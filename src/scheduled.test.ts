import { describe, expect, it } from "vitest";
import { parseMode } from "./scheduled.js";

describe("scheduled CLI", () => {
  it("parses post-draw mode", () => {
    expect(parseMode(["node", "scheduled.js", "post-draw"])).toBe("post-draw");
  });

  it("rejects unknown mode", async () => {
    expect(() => parseMode(["node", "scheduled.js", "unknown"])).toThrow(/Unknown scheduled mode/);
  });
});

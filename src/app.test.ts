import { afterEach, describe, expect, it, vi } from "vitest";
import { createBotApp } from "./app.js";
import { createTestDb } from "./test-db.js";

describe("createBotApp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs one polling tick and one post draw tick without Misskey side effects", async () => {
    const db = await createTestDb();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const app = createBotApp({
      db,
      logger,
      now: () => new Date("2026-05-01T00:00:00.000Z")
    });

    await app.pollOnce();
    await app.drawPostOnce();

    expect(logger.info).toHaveBeenCalledWith("poll.tick", { at: "2026-05-01T00:00:00.000Z" });
    expect(logger.info).toHaveBeenCalledWith("postDraw.tick", { at: "2026-05-01T00:00:00.000Z" });
  });

  it("starts interval timers and returns a stop function", async () => {
    vi.useFakeTimers();
    const db = await createTestDb();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const app = createBotApp({
      db,
      logger,
      now: () => new Date("2026-05-01T00:00:00.000Z")
    });

    const stop = app.start({ pollIntervalMs: 1000, postDrawIntervalMs: 2000 });
    await vi.advanceTimersByTimeAsync(2100);
    stop();
    await vi.advanceTimersByTimeAsync(3000);

    expect(logger.info).toHaveBeenCalledTimes(5);
  });
});

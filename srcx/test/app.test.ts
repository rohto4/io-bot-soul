import { afterEach, describe, expect, it, vi } from "vitest";
import { createBotApp } from "../../src/app.js";
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

  it("starts polling and post draw interval timers and returns a stop function", async () => {
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

    const stop = app.start({ pollIntervalMs: 1000, postDrawIntervalMs: 5000 });
    await vi.advanceTimersByTimeAsync(5100);
    stop();
    await vi.advanceTimersByTimeAsync(3000);

    expect(logger.info).toHaveBeenCalledWith("postDraw.tick", {
      at: "2026-05-01T00:00:00.000Z"
    });
    expect(logger.info).toHaveBeenCalledTimes(7);
  });

  it("skips overlapping post draw ticks", async () => {
    vi.useFakeTimers();
    const db = await createTestDb();
    await db.run(`
      UPDATE m_runtime_setting
      SET setting_value = 'false'
      WHERE setting_key = 'AI_SKIP_POST_ON_AI_FAILURE'
    `);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };
    const client = {
      getNotifications: vi.fn().mockResolvedValue([]),
      createNote: vi.fn().mockImplementation(
        () =>
          new Promise<{ id: string }>((resolve) => {
            setTimeout(() => resolve({ id: "n1" }), 1000);
          })
      ),
      createFollowing: vi.fn().mockResolvedValue(undefined),
      deleteFollowing: vi.fn().mockResolvedValue(undefined),
      getNoteReactions: vi.fn().mockResolvedValue([])
    };

    const app = createBotApp({
      db,
      logger,
      misskey: {
        client,
        pinnedConsentNoteId: "note-consent",
        scheduledPostingEnabled: true
      },
      now: () => new Date("2026-05-01T00:00:00.000Z")
    });

    const stop = app.start({ pollIntervalMs: 10000, postDrawIntervalMs: 100 });
    await vi.advanceTimersByTimeAsync(250);
    stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.warn).toHaveBeenCalledWith("postDraw.skip", { reason: "already_running" });
  });
});

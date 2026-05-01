import { describe, expect, it, vi } from "vitest";
import { runScheduledPostDraw } from "./scheduled-post.js";
import { createTestDb } from "./test-db.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
}

describe("runScheduledPostDraw", () => {
  it("skips posting when scheduled posting is disabled", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn()
    };

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T00:00:00.000Z",
      enabled: false,
      minIntervalMinutes: 30
    });

    expect(client.createNote).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("scheduledPost.skip", {
      at: "2026-05-01T00:00:00.000Z",
      reason: "disabled"
    });
  });

  it("skips posting when the latest normal post is inside the minimum interval", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn()
    };

    await db.run(
      `
      INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
      VALUES (@noteId, @postedAt, 'normal', 'recent', 'home', 'test', @postedAt)
      `,
      {
        noteId: "recent-note",
        postedAt: "2026-05-01T00:20:00.000Z"
      }
    );

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T00:30:00.000Z",
      enabled: true,
      minIntervalMinutes: 30
    });

    expect(client.createNote).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("scheduledPost.skip", {
      at: "2026-05-01T00:30:00.000Z",
      reason: "min_interval",
      latestPostedAt: "2026-05-01T00:20:00.000Z"
    });
  });

  it("creates a home note and records it when posting is enabled", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn(async () => ({ id: "posted-note" }))
    };

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T12:00:00.000Z",
      enabled: true,
      minIntervalMinutes: 30
    });

    expect(client.createNote).toHaveBeenCalledWith({
      text: expect.stringContaining("生活ログ"),
      visibility: "home"
    });

    await expect(db.get("SELECT note_id, kind, visibility, generated_reason FROM posts")).resolves.toEqual({
      note_id: "posted-note",
      kind: "normal",
      visibility: "home",
      generated_reason: "scheduled_post_draw_v0"
    });
    await expect(db.get("SELECT last_note_at FROM bot_state WHERE id = 1")).resolves.toEqual({
      last_note_at: "2026-05-01T12:00:00.000Z"
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { calculateScheduledPostProbability, runScheduledPostDraw } from "../../src/scheduled-post.js";
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
      createNote: vi.fn(),
      getHomeTimeline: vi.fn(async () => []),
      getUserNotes: vi.fn(async () => [])
    };

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T00:00:00.000Z",
      enabled: false
    });

    expect(client.createNote).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("scheduledPost.skip", {
      at: "2026-05-01T00:00:00.000Z",
      reason: "disabled"
    });
  });

  it("skips posting when the latest normal post is inside the hard minimum interval", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn(),
      getHomeTimeline: vi.fn(async () => []),
      getUserNotes: vi.fn(async () => [])
    };

    await db.run(
      `
      INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
      VALUES (@noteId, @postedAt, 'normal', 'recent', 'home', 'test', @postedAt)
      `,
      {
        noteId: "recent-note",
        postedAt: "2026-05-01T00:27:00.000Z"
      }
    );

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T00:30:00.000Z",
      enabled: true
    });

    expect(client.createNote).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("scheduledPost.skip", {
      at: "2026-05-01T00:30:00.000Z",
      reason: "min_interval",
      latestPostedAt: "2026-05-01T00:27:00.000Z"
    });
  });

  it("skips posting by probability after the hard minimum interval", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn(),
      getHomeTimeline: vi.fn(async () => []),
      getUserNotes: vi.fn(async () => [])
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
      random: () => 0.9
    });

    expect(client.createNote).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("scheduledPost.skip", {
      at: "2026-05-01T00:30:00.000Z",
      reason: "probability",
      latestPostedAt: "2026-05-01T00:20:00.000Z",
      elapsedMinutes: 10,
      probability: 0.15,
      draw: 0.9
    });
  });

  it("can post by probability after the hard minimum interval", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn(async () => ({ id: "posted-note" })),
      getHomeTimeline: vi.fn(async () => []),
      getUserNotes: vi.fn(async () => [])
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

    // 1回目: TL観測ガチャを外す(0.9 >= 0.20), 2回目: 通常ノート確率テーブルで当てる(0.1 < 0.15)
    const calls = [0.9, 0.1];
    let ci = 0;
    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T00:30:00.000Z",
      enabled: true,
      random: () => calls[ci++] ?? 0.9,
      generateText: async () => "生活ログ、テスト。"
    });

    expect(client.createNote).toHaveBeenCalledTimes(1);
  });

  it("uses runtime settings from DB for scheduled post probability", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn(async () => ({ id: "posted-note" })),
      getHomeTimeline: vi.fn(async () => []),
      getUserNotes: vi.fn(async () => [])
    };

    await db.run(
      `
      UPDATE m_runtime_setting
      SET setting_value = '0.95'
      WHERE setting_key = 'POST_PROBABILITY_10_MIN'
      `
    );
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
      random: () => 0.9,
      generateText: async () => "生活ログ、テスト。"
    });

    expect(client.createNote).toHaveBeenCalledTimes(1);
  });

  it("creates a home note and records it when posting is enabled", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn(async () => ({ id: "posted-note" })),
      getHomeTimeline: vi.fn(async () => []),
      getUserNotes: vi.fn(async () => [])
    };

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T12:00:00.000Z",
      enabled: true,
      random: () => 0.9, // TL観測ガチャを外す。latestNormalなしなので直接normal
      generateText: async () => "生活ログ、テスト。"
    });

    expect(client.createNote).toHaveBeenCalledWith({
      text: expect.stringContaining("生活ログ"),
      visibility: "public"
    });

    await expect(db.get("SELECT note_id, kind, visibility, generated_reason FROM posts")).resolves.toEqual({
      note_id: "posted-note",
      kind: "normal",
      visibility: "public",
      generated_reason: "scheduled_post_draw_v0"
    });
    await expect(db.get("SELECT last_note_at FROM bot_state WHERE id = 1")).resolves.toEqual({
      last_note_at: "2026-05-01T12:00:00.000Z"
    });
  });

  it("calculates a low probability before the full probability interval", () => {
    expect(
      calculateScheduledPostProbability({
        elapsedMinutes: 5,
        minIntervalMinutes: 5
      })
    ).toBeCloseTo(0.1);
    expect(
      calculateScheduledPostProbability({
        elapsedMinutes: 30,
        minIntervalMinutes: 5
      })
    ).toBeCloseTo(0.8);
    expect(
      calculateScheduledPostProbability({
        elapsedMinutes: 60,
        minIntervalMinutes: 5
      })
    ).toBeCloseTo(0.95);
  });
});

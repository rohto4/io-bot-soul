import { describe, expect, it, vi } from "vitest";
import { runScheduledPostDraw } from "../../src/scheduled-post.js";
import { createTestDb } from "./test-db.js";

const AT = "2026-05-01T00:30:00.000Z";

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function createClient(noteId = "posted-note") {
  return {
    createNote: vi.fn(async () => ({ id: noteId })),
    getHomeTimeline: vi.fn(async () => []),
    getUserNotes: vi.fn(async () => [])
  };
}

describe("AI backoff", () => {
  it("skips posting when within ai_backoff_until", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = createClient();

    // backoff_until を未来に設定
    const backoffUntil = "2026-05-01T01:00:00.000Z";
    await db.run(
      "UPDATE bot_state SET ai_backoff_until = @backoffUntil WHERE id = 1",
      { backoffUntil }
    );

    await runScheduledPostDraw({ db, logger, client, at: AT, enabled: true });

    expect(client.createNote).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("scheduledPost.skip", {
      at: AT,
      reason: "ai_backoff",
      backoffUntil,
    });
  });

  it("resumes posting after ai_backoff_until has passed", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = createClient("after-backoff");

    // backoff_until が過去
    await db.run(
      "UPDATE bot_state SET ai_backoff_until = @backoffUntil WHERE id = 1",
      { backoffUntil: "2026-05-01T00:00:00.000Z" }
    );

    // rand(): sleep_at jitter, 体験候補外れ, quote_rn外れ, TL参照外れ, memoryDepth, topic, tone, style
    const calls = [0.5, 0.15, 0.9, 0.9, 0.9, 0.0, 0.0, 0.0];
    let ci = 0;

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: AT,
      enabled: true,
      random: () => calls[ci++] ?? 0.9,
      generateText: async () => "backoff解除後の投稿",
    });

    expect(client.createNote).toHaveBeenCalledOnce();

    // 成功したのでストリークがリセットされているか
    const state = await db.get<{ ai_failure_streak: number; ai_backoff_until: string | null }>(
      "SELECT ai_failure_streak, ai_backoff_until FROM bot_state WHERE id = 1"
    );
    expect(state?.ai_failure_streak).toBe(0);
    expect(state?.ai_backoff_until).toBeNull();
  });

  it("sets ai_backoff_until after AI failure and increments streak", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = createClient();

    // rand(): sleep_at jitter, 体験候補外れ, quote_rn外れ → normal → AI failure
    const calls = [0.5, 0.15, 0.9, 0.9, 0.9, 0.0, 0.0, 0.0];
    let ci = 0;

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: AT,
      enabled: true,
      random: () => calls[ci++] ?? 0.9,
      generateText: async () => null, // AI 失敗
    });

    expect(client.createNote).not.toHaveBeenCalled();

    const state = await db.get<{ ai_failure_streak: number; ai_backoff_until: string | null }>(
      "SELECT ai_failure_streak, ai_backoff_until FROM bot_state WHERE id = 1"
    );
    // streak が 1 に増えていること
    expect(state?.ai_failure_streak).toBe(1);
    // backoff_until が設定されていること（AT から base=300秒後）
    expect(state?.ai_backoff_until).toBeDefined();
    const backoffUntilMs = new Date(state!.ai_backoff_until!).getTime();
    const atMs = new Date(AT).getTime();
    expect(backoffUntilMs).toBeGreaterThan(atMs);
  });
});

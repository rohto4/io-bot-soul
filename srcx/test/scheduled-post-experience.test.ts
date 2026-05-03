import { describe, expect, it, vi } from "vitest";
import { runScheduledPostDraw } from "../../src/scheduled-post.js";
import { createTestDb } from "./test-db.js";

const AT = "2026-05-01T00:30:00.000Z";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
}

function createClient(noteId = "posted-note") {
  return {
    createNote: vi.fn(async () => ({ id: noteId })),
    getHomeTimeline: vi.fn(async () => []),
    getUserNotes: vi.fn(async () => [])
  };
}

async function insertPendingCandidate(db: Awaited<ReturnType<typeof createTestDb>>, summary: string) {
  await db.run(
    `INSERT INTO experience_candidates
       (source_note_id, source_user_id, picked_at, candidate_type,
        summary, safety_class, status, expires_at, created_at)
     VALUES (@sourceNoteId, NULL, @at, 'tl_observation', @summary, 'ok', 'pending', @expiresAt, @at)`,
    {
      sourceNoteId: "src-note-1",
      at: AT,
      summary,
      expiresAt: "2026-05-07T00:00:00.000Z",
    }
  );
}

describe("scheduled post: experience candidate gacha", () => {
  it("posts and records when candidate exists and gacha wins", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = createClient("exp-note-1");

    await insertPendingCandidate(db, "気になる体験の候補");

    // rand()消費: #1=sleep_at jitter, #2=体験候補ガチャ当選(0.05 < 0.10)
    const calls = [0.5, 0.05];
    let ci = 0;

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: AT,
      enabled: true,
      random: () => calls[ci++] ?? 0.9,
      generateText: async () => "気になる体験をしてきた。",
    });

    expect(client.createNote).toHaveBeenCalledOnce();
    expect(client.createNote).toHaveBeenCalledWith({
      text: "気になる体験をしてきた。",
      visibility: "public",
    });

    // posts に experience_candidate で記録されているか
    const post = await db.get<{ generated_reason: string }>(
      "SELECT generated_reason FROM posts WHERE note_id = 'exp-note-1'"
    );
    expect(post?.generated_reason).toBe("experience_candidate");

    // experience_candidates の status が executed になっているか
    const cand = await db.get<{ status: string; executed_post_id: string }>(
      "SELECT status, executed_post_id FROM experience_candidates LIMIT 1"
    );
    expect(cand?.status).toBe("executed");
    expect(cand?.executed_post_id).toBe("exp-note-1");

    // experience_logs に昇格されているか
    const log = await db.get<{ experience_type: string }>(
      "SELECT experience_type FROM experience_logs LIMIT 1"
    );
    expect(log?.experience_type).toBe("candidate_post");

    expect(logger.info).toHaveBeenCalledWith(
      "scheduledPost.experienceCandidate",
      expect.objectContaining({ at: AT, noteId: "exp-note-1" })
    );
  });

  it("logs no_experience_candidates and falls through to normal flow when gacha wins but no candidates", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = createClient("normal-note-2");

    // rand()消費: #1=sleep_at jitter, #2=体験候補ガチャ当選(0.05 < 0.10)
    // 候補なし → 通常フローへ落ちる
    // #3=quote_rn外れ(0.9), #4=TL参照外れ(0.9)→no_tl
    // #5=memoryDepth, #6=topic, #7=tone, #8=style
    const calls = [0.5, 0.05, 0.9, 0.9, 0.9, 0.0, 0.0, 0.0];
    let ci = 0;

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: AT,
      enabled: true,
      random: () => calls[ci++] ?? 0.9,
      generateText: async () => "通常フローに落ちた投稿",
    });

    // "no_experience_candidates" ログが出ていること
    expect(logger.info).toHaveBeenCalledWith("scheduledPost.skip", {
      at: AT,
      reason: "no_experience_candidates",
    });

    // 通常フローで投稿されること（experience_candidate ではない）
    expect(client.createNote).toHaveBeenCalledOnce();
    const post = await db.get<{ generated_reason: string }>(
      "SELECT generated_reason FROM posts WHERE note_id = 'normal-note-2'"
    );
    expect(post?.generated_reason).toBe("no_tl");
  });

  it("falls through to normal flow when gacha misses", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = createClient("normal-note-1");

    await insertPendingCandidate(db, "候補があっても外れる");

    // rand()消費:
    // #1=sleep_at jitter, #2=体験候補ガチャ外れ(0.15 >= 0.10)
    // #3=quote_rn外れ(0.9 >= 0.20), #4=TL参照外れ(0.9 >= 0.50)→no_tl
    // #5=memoryDepth(0.9→normal), #6=topic, #7=tone, #8=style
    const calls = [0.5, 0.15, 0.9, 0.9, 0.9, 0.0, 0.0, 0.0];
    let ci = 0;

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: AT,
      enabled: true,
      random: () => calls[ci++] ?? 0.9,
      generateText: async () => "通常の投稿テキスト",
    });

    expect(client.createNote).toHaveBeenCalledOnce();

    // experience_candidate ではなく通常の投稿として記録されているか
    const post = await db.get<{ generated_reason: string }>(
      "SELECT generated_reason FROM posts WHERE note_id = 'normal-note-1'"
    );
    expect(post?.generated_reason).toBe("no_tl");

    // experience_candidates は pending のまま
    const cand = await db.get<{ status: string }>(
      "SELECT status FROM experience_candidates LIMIT 1"
    );
    expect(cand?.status).toBe("pending");
  });
});

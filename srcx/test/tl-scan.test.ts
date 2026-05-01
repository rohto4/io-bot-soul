import { describe, expect, it, vi } from "vitest";
import { runTlScan } from "../../src/tl-scan.js";
import { createTestDb } from "./test-db.js";

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe("runTlScan", () => {
  it("saves valid notes to source_notes and returns summaries", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      getHomeTimeline: vi.fn(async () => [
        { id: "n1", createdAt: "2026-05-01T10:00:00Z", userId: "u1", user: { id: "u1", username: "alice" }, text: "今日は晴れで気持ちよかった", cw: null, visibility: "public", replyId: null, renoteId: null },
        { id: "n2", createdAt: "2026-05-01T10:01:00Z", userId: "u2", user: { id: "u2", username: "bob" }, text: null, cw: null, visibility: "public", replyId: null, renoteId: null },
        { id: "n3", createdAt: "2026-05-01T10:02:00Z", userId: "u3", user: { id: "u3", username: "carol" }, text: "CWあり", cw: "注意", visibility: "public", replyId: null, renoteId: null },
        { id: "n4", createdAt: "2026-05-01T10:03:00Z", userId: "u4", user: { id: "u4", username: "dave" }, text: "renote元", cw: null, visibility: "public", replyId: null, renoteId: "orig-id" },
        { id: "n5", createdAt: "2026-05-01T10:04:00Z", userId: "u5", user: { id: "u5", username: "eve" }, text: "図書館で面白い本を見つけた", cw: null, visibility: "public", replyId: null, renoteId: null }
      ])
    };

    const result = await runTlScan({ db, client, logger, at: "2026-05-01T10:05:00Z", limit: 20 });

    // null, CW, renote を除外して2件のみ保存
    expect(result.summaries).toHaveLength(2);
    expect(result.summaries[0]).toBe("今日は晴れで気持ちよかった");
    expect(result.summaries[1]).toBe("図書館で面白い本を見つけた");

    const saved = await db.all("SELECT note_id, text_summary FROM source_notes ORDER BY note_id");
    expect(saved).toHaveLength(2);
  });

  it("skips already-saved notes via ON CONFLICT DO NOTHING", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const note = {
      id: "dup", createdAt: "2026-05-01T10:00:00Z", userId: "u1",
      user: { id: "u1", username: "alice" }, text: "重複ノート",
      cw: null, visibility: "public", replyId: null, renoteId: null
    };
    const client = { getHomeTimeline: vi.fn(async () => [note, note]) };

    await runTlScan({ db, client, logger, at: "2026-05-01T10:05:00Z", limit: 20 });

    const saved = await db.all("SELECT note_id FROM source_notes");
    expect(saved).toHaveLength(1);
  });

  it("updates last_timeline_scan_at in bot_state", async () => {
    const db = await createTestDb();
    const logger = createLogger();
    const client = { getHomeTimeline: vi.fn(async () => []) };

    await runTlScan({ db, client, logger, at: "2026-05-01T10:05:00Z", limit: 20 });

    const state = await db.get<{ last_timeline_scan_at: string }>(
      "SELECT last_timeline_scan_at FROM bot_state WHERE id = 1"
    );
    expect(state?.last_timeline_scan_at).toBe("2026-05-01T10:05:00Z");
  });
});

describe("TL observation action lottery", () => {
  it("posts a tl_observation note when TL has enough summaries", async () => {
    const { runScheduledPostDraw } = await import("../../src/scheduled-post.js");
    const db = await createTestDb();
    const logger = createLogger();
    const tlNotes = [
      { id: "n1", createdAt: "2026-05-01T10:00:00Z", userId: "u1", user: { id: "u1", username: "a" }, text: "ノート1", cw: null, visibility: "public", replyId: null, renoteId: null },
      { id: "n2", createdAt: "2026-05-01T10:01:00Z", userId: "u2", user: { id: "u2", username: "b" }, text: "ノート2", cw: null, visibility: "public", replyId: null, renoteId: null },
      { id: "n3", createdAt: "2026-05-01T10:02:00Z", userId: "u3", user: { id: "u3", username: "c" }, text: "ノート3", cw: null, visibility: "public", replyId: null, renoteId: null }
    ];
    const client = {
      createNote: vi.fn(async () => ({ id: "tl-note" })),
      getHomeTimeline: vi.fn(async () => tlNotes),
      getUserNotes: vi.fn(async () => [])
    };

    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T12:00:00Z",
      enabled: true,
      random: () => 0.1, // 0.1 < 0.20 → TL観測抽選当たり
      generateTlText: async () => "TLを眺めていた。"
    });

    expect(client.createNote).toHaveBeenCalledTimes(1);
    const post = await db.get<{ kind: string }>("SELECT kind FROM posts LIMIT 1");
    expect(post?.kind).toBe("tl_observation");
  });

  it("posts a quote_renote when candidate is found (quoteRoll < quoteProb)", async () => {
    const { runScheduledPostDraw } = await import("../../src/scheduled-post.js");
    const db = await createTestDb();
    const logger = createLogger();
    const tlNotes = [
      { id: "n1", createdAt: "2026-05-01T10:00:00Z", userId: "u1", user: { id: "u1", username: "a" }, text: "ノート1", cw: null, visibility: "public", replyId: null, renoteId: null },
      { id: "n2", createdAt: "2026-05-01T10:01:00Z", userId: "u2", user: { id: "u2", username: "b" }, text: "ノート2", cw: null, visibility: "public", replyId: null, renoteId: null },
      { id: "n3", createdAt: "2026-05-01T10:02:00Z", userId: "u3", user: { id: "u3", username: "c" }, text: "ノート3", cw: null, visibility: "public", replyId: null, renoteId: null },
    ];
    const client = {
      createNote: vi.fn(async () => ({ id: "qrn-note" })),
      getHomeTimeline: vi.fn(async () => tlNotes),
      getUserNotes: vi.fn(async () => [])
    };
    const quoteCandidate = { noteId: "source-note", text: "引用元のノート本文", userId: "u1" };

    await runScheduledPostDraw({
      db, logger, client,
      at: "2026-05-01T12:00:00Z",
      enabled: true,
      // tlRoll=0.1 < 0.20 → TL観測当たり, quoteRoll=0.1 < 0.20 → 引用RN当たり
      random: () => 0.1,
      pickQuote: async () => quoteCandidate,
      generateQuoteText: async () => "これ気になった。"
    });

    expect(client.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ renoteId: "source-note" })
    );
    const post = await db.get<{ kind: string; quote_source_note_id: string }>(
      "SELECT kind, quote_source_note_id FROM posts LIMIT 1"
    );
    expect(post?.kind).toBe("quote_renote");
    expect(post?.quote_source_note_id).toBe("source-note");
  });

  it("skips without fallback to normal when TL has too few summaries", async () => {
    const { runScheduledPostDraw } = await import("../../src/scheduled-post.js");
    const db = await createTestDb();
    const logger = createLogger();
    const client = {
      createNote: vi.fn(async () => ({ id: "normal-note" })),
      getHomeTimeline: vi.fn(async () => []), // 空 → too_few_summaries
      getUserNotes: vi.fn(async () => [])
    };

    // 0.1 < 0.20 → TL観測当たり → summaries=0 → skip（通常ノートへは落ちない）
    await runScheduledPostDraw({
      db,
      logger,
      client,
      at: "2026-05-01T12:00:00Z",
      enabled: true,
      random: () => 0.1,
      generateText: async () => "通常ノート。"
    });

    expect(client.createNote).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "scheduledPost.skip",
      expect.objectContaining({ reason: "too_few_summaries" })
    );
  });
});

import { describe, expect, it } from "vitest";
import { checkNotesPerHour, checkNotesPerDay, checkQuoteRenotesPerDay, checkUserTriggeredPer5Min } from "../../src/rate-limit.js";
import { createTestDb } from "./test-db.js";

describe("rate limit", () => {
  it("checkNotesPerHour returns false when under the limit", async () => {
    const db = await createTestDb();
    const at = "2026-05-01T12:00:00.000Z";

    // 4件の投稿（制限5件未満）
    for (let i = 0; i < 4; i++) {
      await db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'normal', 'text', 'public', 'no_tl', @postedAt)`,
        { noteId: `note-${i}`, postedAt: new Date(new Date(at).getTime() - i * 10 * 60 * 1000).toISOString() }
      );
    }

    const hit = await checkNotesPerHour(db, at, 5);
    expect(hit).toBe(false);
  });

  it("checkNotesPerHour returns true when at the limit", async () => {
    const db = await createTestDb();
    const at = "2026-05-01T12:00:00.000Z";

    for (let i = 0; i < 5; i++) {
      await db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'normal', 'text', 'public', 'no_tl', @postedAt)`,
        { noteId: `note-${i}`, postedAt: new Date(new Date(at).getTime() - i * 10 * 60 * 1000).toISOString() }
      );
    }

    const hit = await checkNotesPerHour(db, at, 5);
    expect(hit).toBe(true);
  });

  it("checkNotesPerDay returns true when limit is reached", async () => {
    const db = await createTestDb();
    const at = "2026-05-01T12:00:00.000Z";

    for (let i = 0; i < 50; i++) {
      await db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'normal', 'text', 'public', 'no_tl', @postedAt)`,
        { noteId: `note-${i}`, postedAt: new Date(new Date(at).getTime() - i * 25 * 60 * 1000).toISOString() }
      );
    }

    const hit = await checkNotesPerDay(db, at, 50);
    expect(hit).toBe(true);
  });

  it("checkQuoteRenotesPerDay counts only quote_renote kind", async () => {
    const db = await createTestDb();
    const at = "2026-05-01T12:00:00.000Z";

    // normal 5件 + quote_renote 4件
    for (let i = 0; i < 5; i++) {
      await db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'normal', 'text', 'public', 'no_tl', @postedAt)`,
        { noteId: `normal-${i}`, postedAt: new Date(new Date(at).getTime() - i * 10 * 60 * 1000).toISOString() }
      );
    }
    for (let i = 0; i < 4; i++) {
      await db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'quote_renote', 'text', 'public', 'quote_renote', @postedAt)`,
        { noteId: `quote-${i}`, postedAt: new Date(new Date(at).getTime() - i * 10 * 60 * 1000).toISOString() }
      );
    }

    const hit = await checkQuoteRenotesPerDay(db, at, 5);
    expect(hit).toBe(false);

    // quote_renote をもう1件追加して5件にする
    await db.run(
      `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
       VALUES (@noteId, @postedAt, 'quote_renote', 'text', 'public', 'quote_renote', @postedAt)`,
      { noteId: "quote-4", postedAt: at }
    );

    const hit2 = await checkQuoteRenotesPerDay(db, at, 5);
    expect(hit2).toBe(true);
  });

  it("checkUserTriggeredPer5Min returns false when under limit", async () => {
    const db = await createTestDb();
    const at = "2026-05-01T12:00:00.000Z";

    // 4件のリプライ（5分以内）
    for (let i = 0; i < 4; i++) {
      await db.run(
        `INSERT INTO reply_logs (target_note_id, target_user_id, replied_at, reason, status)
         VALUES (@noteId, 'user-1', @repliedAt, 'stop', 'posted')`,
        {
          noteId: `note-${i}`,
          repliedAt: new Date(new Date(at).getTime() - i * 60 * 1000).toISOString()
        }
      );
    }

    const hit = await checkUserTriggeredPer5Min(db, at, 5);
    expect(hit).toBe(false);
  });

  it("checkUserTriggeredPer5Min returns true when at limit", async () => {
    const db = await createTestDb();
    const at = "2026-05-01T12:00:00.000Z";

    for (let i = 0; i < 5; i++) {
      await db.run(
        `INSERT INTO reply_logs (target_note_id, target_user_id, replied_at, reason, status)
         VALUES (@noteId, 'user-1', @repliedAt, 'stop', 'posted')`,
        {
          noteId: `note-${i}`,
          repliedAt: new Date(new Date(at).getTime() - i * 60 * 1000).toISOString()
        }
      );
    }

    const hit = await checkUserTriggeredPer5Min(db, at, 5);
    expect(hit).toBe(true);
  });

  it("checkUserTriggeredPer5Min ignores replies older than 5 minutes", async () => {
    const db = await createTestDb();
    const at = "2026-05-01T12:00:00.000Z";

    // 6分前のリプライ（ウィンドウ外）
    await db.run(
      `INSERT INTO reply_logs (target_note_id, target_user_id, replied_at, reason, status)
       VALUES ('note-old', 'user-1', @repliedAt, 'stop', 'posted')`,
      { repliedAt: new Date(new Date(at).getTime() - 6 * 60 * 1000).toISOString() }
    );

    const hit = await checkUserTriggeredPer5Min(db, at, 1);
    expect(hit).toBe(false);
  });
});

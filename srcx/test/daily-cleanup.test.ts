import { describe, expect, it, vi } from "vitest";
import { runDailyCleanup } from "../../src/daily-cleanup.js";
import { createTestDb } from "./test-db.js";

const AT = "2026-05-04T12:00:00.000Z";

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe("runDailyCleanup: expireCandidates (P5-4)", () => {
  it("expires pending candidates whose expires_at has passed", async () => {
    const db = await createTestDb();
    const logger = createLogger();

    // 期限切れ候補
    await db.run(
      `INSERT INTO experience_candidates
         (source_note_id, picked_at, candidate_type, summary, safety_class, status, expires_at, created_at)
       VALUES ('note-1', @at, 'tl_observation', '期限切れ候補', 'ok', 'pending', '2026-05-01T00:00:00.000Z', @at)`,
      { at: AT }
    );
    // 有効な候補
    await db.run(
      `INSERT INTO experience_candidates
         (source_note_id, picked_at, candidate_type, summary, safety_class, status, expires_at, created_at)
       VALUES ('note-2', @at, 'tl_observation', '有効な候補', 'ok', 'pending', '2026-05-10T00:00:00.000Z', @at)`,
      { at: AT }
    );
    // 既に executed
    await db.run(
      `INSERT INTO experience_candidates
         (source_note_id, picked_at, candidate_type, summary, safety_class, status, expires_at, created_at)
       VALUES ('note-3', @at, 'tl_observation', '実行済み', 'ok', 'executed', '2026-05-01T00:00:00.000Z', @at)`,
      { at: AT }
    );

    await runDailyCleanup({ db, logger, at: AT, debugDir: "/nonexistent" });

    const expired = await db.get<{ status: string }>(
      "SELECT status FROM experience_candidates WHERE source_note_id = 'note-1'"
    );
    const valid = await db.get<{ status: string }>(
      "SELECT status FROM experience_candidates WHERE source_note_id = 'note-2'"
    );
    const executed = await db.get<{ status: string }>(
      "SELECT status FROM experience_candidates WHERE source_note_id = 'note-3'"
    );

    expect(expired?.status).toBe("expired");
    expect(valid?.status).toBe("pending");
    expect(executed?.status).toBe("executed");

    expect(logger.info).toHaveBeenCalledWith(
      "dailyCleanup.expireCandidates.done",
      expect.objectContaining({ expired: 1 })
    );
  });

  it("does nothing when there are no expired candidates", async () => {
    const db = await createTestDb();
    const logger = createLogger();

    await runDailyCleanup({ db, logger, at: AT, debugDir: "/nonexistent" });

    expect(logger.info).toHaveBeenCalledWith(
      "dailyCleanup.expireCandidates.done",
      expect.objectContaining({ expired: 0 })
    );
  });
});

describe("runDailyCleanup: deleteOldSourceNotes (P5-5)", () => {
  it("deletes source_notes older than retentionDays", async () => {
    const db = await createTestDb();
    const logger = createLogger();

    // 31日前（削除対象）
    const oldDate = "2026-04-03T00:00:00.000Z";
    await db.run(
      `INSERT INTO source_notes (note_id, captured_at) VALUES ('old-note', @captured_at)`,
      { captured_at: oldDate }
    );
    // 1日前（保持対象）
    const recentDate = "2026-05-03T00:00:00.000Z";
    await db.run(
      `INSERT INTO source_notes (note_id, captured_at) VALUES ('recent-note', @captured_at)`,
      { captured_at: recentDate }
    );

    await runDailyCleanup({ db, logger, at: AT, debugDir: "/nonexistent", sourceNotesRetentionDays: 30 });

    const old = await db.get("SELECT note_id FROM source_notes WHERE note_id = 'old-note'");
    const recent = await db.get("SELECT note_id FROM source_notes WHERE note_id = 'recent-note'");

    expect(old).toBeUndefined();
    expect(recent).toBeDefined();

    expect(logger.info).toHaveBeenCalledWith(
      "dailyCleanup.deleteSourceNotes.done",
      expect.objectContaining({ deleted: 1, retentionDays: 30 })
    );
  });
});

import { describe, expect, it } from "vitest";
import { pickExperienceCandidate } from "../../src/experience-pick.js";
import { createTestDb } from "./test-db.js";

const AT = "2026-05-04T12:00:00.000Z";
const FUTURE = "2026-05-07T12:00:00.000Z";
const PAST = "2026-05-01T12:00:00.000Z";

async function insertCandidate(db: Awaited<ReturnType<typeof createTestDb>>, opts: {
  id?: number;
  status?: string;
  expiresAt?: string | null;
  summary?: string;
}) {
  await db.run(
    `INSERT INTO experience_candidates
       (source_note_id, source_user_id, picked_at, candidate_type,
        summary, safety_class, status, expires_at, created_at)
     VALUES
       (@sourceNoteId, NULL, @pickedAt, 'tl_observation',
        @summary, 'ok', @status, @expiresAt, @createdAt)`,
    {
      sourceNoteId: `note-${Math.random()}`,
      pickedAt: AT,
      summary: opts.summary ?? "テスト候補",
      status: opts.status ?? "pending",
      expiresAt: opts.expiresAt !== undefined ? opts.expiresAt : FUTURE,
      createdAt: AT,
    }
  );
}

describe("pickExperienceCandidate", () => {
  it("returns undefined when no candidates exist", async () => {
    const db = await createTestDb();
    const result = await pickExperienceCandidate(db, AT);
    expect(result).toBeUndefined();
  });

  it("returns a pending candidate within expiry", async () => {
    const db = await createTestDb();
    await insertCandidate(db, { summary: "候補A" });

    const result = await pickExperienceCandidate(db, AT);
    expect(result).toBeDefined();
    expect(result!.summary).toBe("候補A");
  });

  it("does not return an executed candidate", async () => {
    const db = await createTestDb();
    await insertCandidate(db, { status: "executed" });

    const result = await pickExperienceCandidate(db, AT);
    expect(result).toBeUndefined();
  });

  it("does not return an expired candidate", async () => {
    const db = await createTestDb();
    await insertCandidate(db, { expiresAt: PAST });

    const result = await pickExperienceCandidate(db, AT);
    expect(result).toBeUndefined();
  });

  it("returns a candidate with null expires_at (no expiry)", async () => {
    const db = await createTestDb();
    await insertCandidate(db, { expiresAt: null });

    const result = await pickExperienceCandidate(db, AT);
    expect(result).toBeDefined();
  });

  it("returns only from pending candidates when mixed statuses exist", async () => {
    const db = await createTestDb();
    await insertCandidate(db, { status: "executed", summary: "実行済み" });
    await insertCandidate(db, { status: "pending", summary: "保留中" });
    await insertCandidate(db, { expiresAt: PAST, summary: "期限切れ" });

    const result = await pickExperienceCandidate(db, AT);
    expect(result).toBeDefined();
    expect(result!.summary).toBe("保留中");
  });
});

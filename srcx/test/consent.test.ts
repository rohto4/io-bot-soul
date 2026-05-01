import { describe, expect, it } from "vitest";
import { canUseUserAsExperienceSource } from "../../src/consent.js";
import { createTestDb } from "./test-db.js";
import type { DbClient } from "../../src/db/client.js";

async function createDb(): Promise<DbClient> {
  const db = await createTestDb();
  await db.run(
    `
    INSERT INTO experience_source_consents (
      user_id,
      username,
      consent_status,
      created_at,
      updated_at
    )
    VALUES
      ('u1', 'alice', 'consented', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
      ('u2', 'bob', 'stopped', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')
    `
  );
  return db;
}

describe("canUseUserAsExperienceSource", () => {
  it("allows consented users", async () => {
    const db = await createDb();

    await expect(canUseUserAsExperienceSource(db, { userId: "u1", username: "alice" })).resolves.toEqual({
      allowed: true,
      reason: "consented",
      userId: "u1",
      username: "alice"
    });
  });

  it("rejects stopped or unregistered users", async () => {
    const db = await createDb();

    await expect(canUseUserAsExperienceSource(db, { userId: "u2", username: "bob" })).resolves.toMatchObject({
      allowed: false,
      reason: "not_consented"
    });
    await expect(canUseUserAsExperienceSource(db, { userId: "u3", username: "carol" })).resolves.toMatchObject({
      allowed: false,
      reason: "not_consented"
    });
  });

  it("rejects source notes without a user id", async () => {
    const db = await createDb();

    await expect(canUseUserAsExperienceSource(db, { username: "unknown" })).resolves.toEqual({
      allowed: false,
      reason: "missing_user_id"
    });
  });
});

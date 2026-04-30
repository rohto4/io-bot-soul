import type { DbClient } from "./db/client.js";

export type SourceUserRef = {
  userId?: string | null;
  username?: string | null;
  host?: string | null;
};

export type ConsentDecision = {
  allowed: boolean;
  reason: "consented" | "missing_user_id" | "not_consented";
  userId?: string;
  username?: string | null;
};

export async function canUseUserAsExperienceSource(
  db: DbClient,
  sourceUser: SourceUserRef
): Promise<ConsentDecision> {
  if (!sourceUser.userId) {
    return {
      allowed: false,
      reason: "missing_user_id"
    };
  }

  const row = await db.get<{ user_id: string; username: string | null }>(
      `
      SELECT user_id, username
      FROM experience_source_consents
      WHERE user_id = @user_id
        AND consent_status = 'consented'
      LIMIT 1
      `,
    { user_id: sourceUser.userId }
  );

  if (!row) {
    return {
      allowed: false,
      reason: "not_consented",
      userId: sourceUser.userId,
      username: sourceUser.username
    };
  }

  return {
    allowed: true,
    reason: "consented",
    userId: row.user_id,
    username: row.username
  };
}

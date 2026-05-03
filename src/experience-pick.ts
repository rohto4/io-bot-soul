import type { DbClient } from "./db/client.js";

type CandidateRow = {
  id: number;
  source_user_id: string | null;
  summary: string;
};

export async function pickExperienceCandidate(db: DbClient, at: string): Promise<CandidateRow | undefined> {
  // status='pending' かつ有効期限内の候補からランダムに1件を選ぶ
  const row = await db.get<CandidateRow>(
    `
    SELECT id, source_user_id, summary
    FROM experience_candidates
    WHERE status = 'pending'
      AND (expires_at IS NULL OR expires_at > @at)
    ORDER BY RANDOM()
    LIMIT 1
    `,
    { at }
  );
  return row ?? undefined;
}

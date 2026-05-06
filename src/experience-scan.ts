import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import { runTlScanPassive } from "./tl-scan.js";
import { classifyExperienceCandidateBatch } from "./ai/classify-experience-candidate.js";
import { passesLightweightFilter } from "./safety-filter.js";
import type { RuntimeSettings } from "./runtime-settings.js";

export async function runExperienceScan(options: {
  db: DbClient;
  client: Pick<MisskeyClient, "getHomeTimeline">;
  logger: Logger;
  settings: RuntimeSettings;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  at: string;
  limit?: number;
}): Promise<void> {
  const limit = options.limit ?? 20;
  options.logger.info("experienceScan.tick", { at: options.at });

  const { summaries } = await runTlScanPassive({
    db: options.db,
    client: options.client,
    logger: options.logger,
    at: options.at,
    limit,
  });

  if (summaries.length === 0) {
    options.logger.info("experienceScan.skip", { at: options.at, reason: "no_valid_notes" });
    return;
  }

  let saved = 0;
  let skipped = 0;

  // 軽量フィルタを先に通す
  const candidates = summaries.filter(s => {
    if (passesLightweightFilter(s)) return true;
    options.logger.info("experienceScan.skip", { at: options.at, reason: "lightweight_filter", summary: s.slice(0, 30) });
    skipped++;
    return false;
  });

  // AI安全判定を一括で実行
  const safeFlags = candidates.length > 0
    ? await classifyExperienceCandidateBatch({
        settings: options.settings,
        texts: candidates,
        chutesApiKey: options.chutesApiKey,
        openaiApiKey: options.openaiApiKey,
        logger: options.logger,
      })
    : [];

  const expiresAt = new Date(new Date(options.at).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  for (let i = 0; i < candidates.length; i++) {
    if (safeFlags[i]) {
      await options.db.run(
        `INSERT INTO experience_candidates (
           source_note_id, source_user_id, picked_at, candidate_type,
           summary, safety_class, status, expires_at, created_at
         )
         VALUES (
           @sourceNoteId, @sourceUserId, @pickedAt, 'tl_observation',
           @summary, 'ok', 'pending', @expiresAt, @createdAt
         )`,
        {
          sourceNoteId: `tl_${options.at}_${saved}`,
          sourceUserId: null,
          pickedAt: options.at,
          summary: candidates[i],
          expiresAt,
          createdAt: options.at,
        }
      );
      saved++;
    } else {
      skipped++;
    }
  }

  options.logger.info("experienceScan.done", {
    at: options.at,
    fetched: summaries.length,
    saved,
    skipped,
  });
}

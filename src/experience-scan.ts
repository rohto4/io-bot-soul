import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import { runTlScanPassive } from "./tl-scan.js";
import { classifyQuoteSafety } from "./ai/classify-quote-safety.js";
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

  // TLの各ノートに対して安全判定
  for (const summary of summaries) {
    const safe = await classifyQuoteSafety({
      settings: options.settings,
      text: summary,
      chutesApiKey: options.chutesApiKey,
      openaiApiKey: options.openaiApiKey,
      logger: options.logger,
    });

    if (safe) {
      // experience_candidates に保存
      // source_note_id が必要だが、runTlScanPassive では返さないので、
      // このバージョンでは summary だけを保存する簡易版とする
      await options.db.run(
        `INSERT INTO experience_candidates (
           source_note_id, source_user_id, picked_at, candidate_type,
           summary, safety_class, status, created_at
         )
         VALUES (
           @sourceNoteId, @sourceUserId, @pickedAt, 'tl_observation',
           @summary, 'ok', 'pending', @createdAt
         )`,
        {
          sourceNoteId: `tl_${options.at}_${saved}`, // 仮のID
          sourceUserId: null,
          pickedAt: options.at,
          summary,
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

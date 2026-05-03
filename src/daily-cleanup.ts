import { readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";

export async function runDailyCleanup(options: {
  db?: DbClient;
  logger: Logger;
  at: string;
  debugDir?: string;
  maxAgeHours?: number;
  sourceNotesRetentionDays?: number;
}): Promise<void> {
  options.logger.info("dailyCleanup.tick", { at: options.at });

  await cleanupDebugFiles(options);

  if (options.db) {
    await expireOldCandidates(options.db, options.at, options.logger);
    await deleteOldSourceNotes(options.db, options.at, options.sourceNotesRetentionDays ?? 30, options.logger);
  }
}

async function cleanupDebugFiles(options: {
  logger: Logger;
  at: string;
  debugDir?: string;
  maxAgeHours?: number;
}): Promise<void> {
  const debugDir = options.debugDir ?? join(process.cwd(), "data", "debug");
  const maxAgeMs = (options.maxAgeHours ?? 24) * 60 * 60 * 1000;
  const now = new Date(options.at).getTime();

  let files: string[];
  try {
    files = await readdir(debugDir);
  } catch {
    options.logger.info("dailyCleanup.debugFiles.skip", { reason: "no_debug_dir" });
    return;
  }

  const promptFiles = files.filter(f => f.startsWith("prompt_") && f.endsWith(".txt"));
  let deleted = 0;
  let skipped = 0;

  for (const file of promptFiles) {
    const filePath = join(debugDir, file);
    try {
      const { mtimeMs } = await stat(filePath);
      if (now - mtimeMs > maxAgeMs) {
        await unlink(filePath);
        deleted++;
      } else {
        skipped++;
      }
    } catch {
      // 既に削除済みなどは無視
    }
  }

  options.logger.info("dailyCleanup.debugFiles.done", { total: promptFiles.length, deleted, skipped });
}

async function expireOldCandidates(db: DbClient, at: string, logger: Logger): Promise<void> {
  const { cnt } = (await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM experience_candidates
     WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < @at`,
    { at }
  )) ?? { cnt: 0 };

  if (cnt > 0) {
    await db.run(
      `UPDATE experience_candidates SET status = 'expired'
       WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < @at`,
      { at }
    );
  }
  logger.info("dailyCleanup.expireCandidates.done", { at, expired: cnt });
}

async function deleteOldSourceNotes(db: DbClient, at: string, retentionDays: number, logger: Logger): Promise<void> {
  const cutoff = new Date(new Date(at).getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { cnt } = (await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM source_notes WHERE captured_at < @cutoff`,
    { cutoff }
  )) ?? { cnt: 0 };

  if (cnt > 0) {
    await db.run(`DELETE FROM source_notes WHERE captured_at < @cutoff`, { cutoff });
  }
  logger.info("dailyCleanup.deleteSourceNotes.done", { at, retentionDays, deleted: cnt });
}

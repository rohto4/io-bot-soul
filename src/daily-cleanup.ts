import { readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "./logger.js";

export async function runDailyCleanup(options: {
  logger: Logger;
  at: string;
  debugDir?: string;
  maxAgeHours?: number;
}): Promise<void> {
  const debugDir = options.debugDir ?? join(process.cwd(), "data", "debug");
  const maxAgeMs = (options.maxAgeHours ?? 24) * 60 * 60 * 1000;
  const now = new Date(options.at).getTime();

  options.logger.info("dailyCleanup.tick", { at: options.at, debugDir, maxAgeHours: options.maxAgeHours ?? 24 });

  let files: string[];
  try {
    files = await readdir(debugDir);
  } catch {
    // ディレクトリ未作成なら何もしない
    options.logger.info("dailyCleanup.skip", { at: options.at, reason: "no_debug_dir" });
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

  options.logger.info("dailyCleanup.done", { at: options.at, total: promptFiles.length, deleted, skipped });
}

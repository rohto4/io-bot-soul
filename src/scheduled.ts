import { createBotApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { createLogger } from "./logger.js";
import { createMisskeyClient } from "./misskey/client.js";
import { fileURLToPath } from "node:url";

type ScheduledMode = "post-draw";

export function parseMode(argv: string[]): ScheduledMode {
  const mode = argv[2];
  if (mode === "post-draw") {
    return mode;
  }

  throw new Error(`Unknown scheduled mode: ${mode ?? "(empty)"}`);
}

export async function runScheduled(mode: ScheduledMode): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const db = await openDatabase({
    provider: config.databaseProvider,
    sqlitePath: config.sqlitePath,
    databaseUrl: config.databaseUrl
  });
  const misskeyClient = createMisskeyClient({
    host: config.misskeyHost,
    token: config.misskeyToken
  });
  const app = createBotApp({
    db,
    logger,
    misskey: {
      client: misskeyClient,
      pinnedConsentNoteId: config.pinnedConsentNoteId,
      replyProbeMaxPerPoll: config.replyProbeMaxPerPoll
    }
  });

  try {
    logger.info("scheduled.start", { mode });
    if (mode === "post-draw") {
      await app.drawPostOnce();
    }
    logger.info("scheduled.done", { mode });
  } finally {
    await db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runScheduled(parseMode(process.argv)).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        at: new Date().toISOString(),
        level: "error",
        message: "scheduled.error",
        error: String(error)
      })
    );
    process.exit(1);
  });
}

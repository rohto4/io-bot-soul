import { loadConfig } from "./config.js";
import { createBotApp } from "./app.js";
import { openDatabase } from "./db/database.js";
import { createLogger } from "./logger.js";
import { createMisskeyClient } from "./misskey/client.js";

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

logger.info("bot.start", {
  misskeyHost: config.misskeyHost,
  adminAccount: config.adminAccount,
  pollIntervalMs: config.pollIntervalMs,
  postDrawIntervalMs: config.postDrawIntervalMs,
  replyProbeMaxPerPoll: config.replyProbeMaxPerPoll
});

const stop = app.start({
  pollIntervalMs: config.pollIntervalMs,
  postDrawIntervalMs: config.postDrawIntervalMs
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info("bot.shutdown", { signal });
  stop();
  void db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import { handleConsentReactions, handleFollowProbe, handleReplyProbe } from "./probe.js";
import { loadRuntimeSettings, readIntegerSetting } from "./runtime-settings.js";
import { runScheduledPostDraw } from "./scheduled-post.js";
import { runExperienceScan } from "./experience-scan.js";

type Clock = () => Date;

type StartIntervals = {
  pollIntervalMs?: number;
  postDrawIntervalMs?: number;
  experienceScanIntervalMs?: number;
};

export type BotApp = {
  pollOnce(): Promise<void>;
  drawPostOnce(): Promise<void>;
  experienceScanOnce(): Promise<void>;
  start(_testIntervals?: StartIntervals): () => void;
};

export function createBotApp(options: {
  db: DbClient;
  logger: Logger;
  misskey?: {
    client: MisskeyClient;
    pinnedConsentNoteId: string;
    scheduledPostingEnabled: boolean;
  };
  now?: Clock;
}): BotApp {
  const now = options.now ?? (() => new Date());

  async function pollOnce(): Promise<void> {
    const at = now().toISOString();
    await options.db.run("UPDATE bot_state SET updated_at = @at WHERE id = 1", { at });
    options.logger.info("poll.tick", { at });

    if (!options.misskey) {
      return;
    }

    const runtimeSettings = await loadRuntimeSettings(options.db);
    const notificationFetchLimit = readIntegerSetting(runtimeSettings, "NOTIFICATION_FETCH_LIMIT", 20);
    const reactionFetchLimit = readIntegerSetting(runtimeSettings, "REACTION_FETCH_LIMIT", 100);

    await handleFollowProbe({
      db: options.db,
      client: options.misskey.client,
      logger: options.logger,
      maxFollows: readIntegerSetting(runtimeSettings, "FOLLOW_PROBE_MAX_PER_POLL", 1),
      notificationFetchLimit,
      at
    });
    await handleReplyProbe({
      db: options.db,
      client: options.misskey.client,
      logger: options.logger,
      maxReplies: readIntegerSetting(runtimeSettings, "REPLY_PROBE_MAX_PER_POLL", 1),
      notificationFetchLimit,
      at
    });
    await handleConsentReactions({
      db: options.db,
      client: options.misskey.client,
      logger: options.logger,
      pinnedConsentNoteId: options.misskey.pinnedConsentNoteId,
      reactionFetchLimit,
      at
    });
  }

  async function drawPostOnce(): Promise<void> {
    const at = now().toISOString();
    await options.db.run("UPDATE bot_state SET updated_at = @at WHERE id = 1", { at });
    options.logger.info("postDraw.tick", { at });

    if (!options.misskey) {
      return;
    }

    await runScheduledPostDraw({
      db: options.db,
      logger: options.logger,
      client: options.misskey.client,
      at,
      enabled: options.misskey.scheduledPostingEnabled
    });
  }

  async function experienceScanOnce(): Promise<void> {
    const at = now().toISOString();
    await options.db.run("UPDATE bot_state SET updated_at = @at WHERE id = 1", { at });

    if (!options.misskey) {
      return;
    }

    const settings = await loadRuntimeSettings(options.db);
    await runExperienceScan({
      db: options.db,
      client: options.misskey.client,
      logger: options.logger,
      settings,
      chutesApiKey: process.env.CHUTES_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      at,
    });
  }

  function start(_testIntervals?: StartIntervals): () => void {
    let cleanup: (() => void) | null = null;

    void (async () => {
      let pollIntervalMs: number;
      let postDrawIntervalMs: number;
      let experienceScanIntervalMs: number;

      if (_testIntervals) {
        pollIntervalMs = _testIntervals.pollIntervalMs ?? 60000;
        postDrawIntervalMs = _testIntervals.postDrawIntervalMs ?? 300000;
        experienceScanIntervalMs = _testIntervals.experienceScanIntervalMs ?? 1200000;
      } else {
        const runtimeSettings = await loadRuntimeSettings(options.db);
        pollIntervalMs = readIntegerSetting(runtimeSettings, "POLL_INTERVAL_SECONDS", 60) * 1000;
        postDrawIntervalMs = readIntegerSetting(runtimeSettings, "POST_DRAW_INTERVAL_SECONDS", 300) * 1000;
        experienceScanIntervalMs = readIntegerSetting(runtimeSettings, "EXPERIENCE_SCAN_INTERVAL_SECONDS", 1200) * 1000;
      }

      let pollRunning = false;
      let postDrawRunning = false;
      let experienceScanRunning = false;

      function runPoll(): void {
        if (pollRunning) {
          options.logger.warn("poll.skip", { reason: "already_running" });
          return;
        }
        pollRunning = true;
        void pollOnce()
          .catch((error: unknown) => {
            options.logger.error("poll.error", { error: String(error) });
          })
          .finally(() => {
            pollRunning = false;
          });
      }

      function runPostDraw(): void {
        if (postDrawRunning) {
          options.logger.warn("postDraw.skip", { reason: "already_running" });
          return;
        }
        postDrawRunning = true;
        void drawPostOnce()
          .catch((error: unknown) => {
            options.logger.error("postDraw.error", { error: String(error) });
          })
          .finally(() => {
            postDrawRunning = false;
          });
      }

      function runExperienceScanWrapper(): void {
        if (experienceScanRunning) {
          options.logger.warn("experienceScan.skip", { reason: "already_running" });
          return;
        }
        experienceScanRunning = true;
        void experienceScanOnce()
          .catch((error: unknown) => {
            options.logger.error("experienceScan.error", { error: String(error) });
          })
          .finally(() => {
            experienceScanRunning = false;
          });
      }

      runPoll();

      const pollTimer = setInterval(runPoll, pollIntervalMs);
      const postDrawTimer = setInterval(runPostDraw, postDrawIntervalMs);
      const experienceScanTimer = setInterval(runExperienceScanWrapper, experienceScanIntervalMs);

      options.logger.info("bot.timers.configured", { pollIntervalMs, postDrawIntervalMs, experienceScanIntervalMs });

      cleanup = () => {
        clearInterval(pollTimer);
        clearInterval(postDrawTimer);
        clearInterval(experienceScanTimer);
      };
    })();

    return () => {
      if (cleanup) cleanup();
    };
  }

  return {
    pollOnce,
    drawPostOnce,
    experienceScanOnce,
    start
  };
}

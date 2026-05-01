import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import { handleConsentReactions, handleFollowProbe, handleReplyProbe } from "./probe.js";
import { loadRuntimeSettings, readIntegerSetting } from "./runtime-settings.js";
import { runScheduledPostDraw } from "./scheduled-post.js";

type Clock = () => Date;

export type BotApp = {
  pollOnce(): Promise<void>;
  drawPostOnce(): Promise<void>;
  start(intervals: { pollIntervalMs: number; postDrawIntervalMs: number }): () => void;
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

  function start(intervals: { pollIntervalMs: number; postDrawIntervalMs: number }): () => void {
    let pollRunning = false;
    let postDrawRunning = false;

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

    runPoll();

    const pollTimer = setInterval(() => {
      runPoll();
    }, intervals.pollIntervalMs);
    const postDrawTimer = setInterval(() => {
      runPostDraw();
    }, intervals.postDrawIntervalMs);

    return () => {
      clearInterval(pollTimer);
      clearInterval(postDrawTimer);
    };
  }

  return {
    pollOnce,
    drawPostOnce,
    start
  };
}

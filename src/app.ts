import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import { handleConsentReactions, handleFollowProbe, handleReplyProbe } from "./probe.js";

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
    replyProbeMaxPerPoll: number;
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

    await handleFollowProbe({
      db: options.db,
      client: options.misskey.client,
      logger: options.logger,
      maxFollows: 1,
      at
    });
    await handleReplyProbe({
      db: options.db,
      client: options.misskey.client,
      logger: options.logger,
      maxReplies: options.misskey.replyProbeMaxPerPoll,
      at
    });
    await handleConsentReactions({
      db: options.db,
      client: options.misskey.client,
      logger: options.logger,
      pinnedConsentNoteId: options.misskey.pinnedConsentNoteId,
      at
    });
  }

  async function drawPostOnce(): Promise<void> {
    const at = now().toISOString();
    await options.db.run("UPDATE bot_state SET updated_at = @at WHERE id = 1", { at });
    options.logger.info("postDraw.tick", { at });
  }

  function start(intervals: { pollIntervalMs: number; postDrawIntervalMs: number }): () => void {
    void pollOnce();
    void drawPostOnce();

    const pollTimer = setInterval(() => {
      void pollOnce().catch((error: unknown) => {
        options.logger.error("poll.error", { error: String(error) });
      });
    }, intervals.pollIntervalMs);

    const postDrawTimer = setInterval(() => {
      void drawPostOnce().catch((error: unknown) => {
        options.logger.error("postDraw.error", { error: String(error) });
      });
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

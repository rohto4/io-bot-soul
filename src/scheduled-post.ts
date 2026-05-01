import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";

type ScheduledPostClient = Pick<MisskeyClient, "createNote">;

export type ScheduledPostDrawOptions = {
  db: DbClient;
  logger: Logger;
  client: ScheduledPostClient;
  at: string;
  enabled: boolean;
  minIntervalMinutes: number;
};

type LatestPostRow = {
  posted_at: string;
};

const scheduledPostTemplates = [
  "生活ログを確認してる。今日は少しだけ外の気配が近い気がする。",
  "生活ログを同期したよ。まだ遠くまでは行けないけど、次に行きたい場所は増えてる。",
  "今の私は、見たことと覚えたことを少しずつつないでるところ。今日のログもちゃんと残しておくね。",
  "生活ログ、異常なし。次の体験候補を探しながら、もう少しだけ起きてる。"
] as const;

export function buildScheduledPostText(at: string): string {
  const hour = new Date(at).getUTCHours();
  return scheduledPostTemplates[hour % scheduledPostTemplates.length];
}

export async function runScheduledPostDraw(options: ScheduledPostDrawOptions): Promise<void> {
  await options.db.run("UPDATE bot_state SET updated_at = @at WHERE id = 1", { at: options.at });

  if (!options.enabled) {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: "disabled" });
    return;
  }

  const latestPost = await options.db.get<LatestPostRow>(
    `
    SELECT posted_at
    FROM posts
    WHERE kind = 'normal'
    ORDER BY posted_at DESC
    LIMIT 1
    `
  );

  if (latestPost) {
    const elapsedMs = new Date(options.at).getTime() - new Date(latestPost.posted_at).getTime();
    if (elapsedMs < options.minIntervalMinutes * 60 * 1000) {
      options.logger.info("scheduledPost.skip", {
        at: options.at,
        reason: "min_interval",
        latestPostedAt: latestPost.posted_at
      });
      return;
    }
  }

  const text = buildScheduledPostText(options.at);
  const visibility = "home";
  const note = await options.client.createNote({ text, visibility });

  await options.db.run(
    `
    INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
    VALUES (@noteId, @postedAt, 'normal', @text, @visibility, 'scheduled_post_draw_v0', @createdAt)
    `,
    {
      noteId: note.id,
      postedAt: options.at,
      text,
      visibility,
      createdAt: options.at
    }
  );
  await options.db.run("UPDATE bot_state SET last_note_at = @at, updated_at = @at WHERE id = 1", {
    at: options.at
  });
  options.logger.info("scheduledPost.posted", { at: options.at, noteId: note.id, visibility });
}

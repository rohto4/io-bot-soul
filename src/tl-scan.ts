import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";

export type TlScanResult = {
  summaries: string[];
};

export async function runTlScan(options: {
  db: DbClient;
  client: Pick<MisskeyClient, "getHomeTimeline">;
  logger: Logger;
  at: string;
  limit: number;
}): Promise<TlScanResult> {
  const notes = await options.client.getHomeTimeline({ limit: options.limit });

  // CW・空テキスト・pure renote を除外
  const valid = notes.filter(
    (n) => n.text && n.text.trim().length > 0 && !n.cw && !n.renoteId
  );

  const summaries: string[] = [];
  for (const note of valid) {
    const textSummary = note.text!.replace(/\n/g, " ").slice(0, 80);

    await options.db.run(
      `INSERT INTO source_notes (
         note_id, user_id, username, host, note_created_at,
         visibility, cw, sensitive, reply_id, renote_id, text_summary, captured_at
       )
       VALUES (
         @noteId, @userId, @username, @host, @noteCreatedAt,
         @visibility, 0, 0, @replyId, @renoteId, @textSummary, @capturedAt
       )
       ON CONFLICT(note_id) DO NOTHING`,
      {
        noteId: note.id,
        userId: note.userId,
        username: note.user?.username ?? null,
        host: note.user?.host ?? null,
        noteCreatedAt: note.createdAt,
        visibility: note.visibility,
        replyId: note.replyId ?? null,
        renoteId: note.renoteId ?? null,
        textSummary,
        capturedAt: options.at,
      }
    );

    summaries.push(textSummary);
  }

  await options.db.run(
    "UPDATE bot_state SET last_timeline_scan_at = @at, updated_at = @at WHERE id = 1",
    { at: options.at }
  );

  options.logger.info("tlScan.done", {
    at: options.at,
    fetched: notes.length,
    valid: valid.length,
    saved: summaries.length,
  });

  return { summaries };
}

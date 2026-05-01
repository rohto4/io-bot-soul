import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";

type ConsentedUser = { user_id: string; username: string | null };

export type QuoteCandidate = {
  noteId: string;
  text: string;
  userId: string;
};

export async function pickQuoteCandidate(options: {
  db: DbClient;
  client: Pick<MisskeyClient, "getUserNotes">;
  logger: Logger;
  at: string;
  notesPerUser?: number;
  random?: () => number;
}): Promise<QuoteCandidate | null> {
  const rand = options.random ?? Math.random;
  const notesPerUser = options.notesPerUser ?? 10;

  const consented = await options.db.all<ConsentedUser>(
    `SELECT user_id, username
     FROM experience_source_consents
     WHERE consent_status = 'consented'
     ORDER BY RANDOM() LIMIT 5`
  );

  if (consented.length === 0) {
    options.logger.info("quotePick.skip", { at: options.at, reason: "no_consented_users" });
    return null;
  }

  for (const user of consented) {
    const notes = await options.client.getUserNotes({
      userId: user.user_id,
      limit: notesPerUser,
    });

    const valid = notes.filter(
      (n) =>
        n.text &&
        n.text.trim().length > 0 &&
        !n.cw &&
        !n.replyId &&
        !n.renoteId &&
        (n.visibility === "public" || n.visibility === "home")
    );

    if (valid.length > 0) {
      const note = valid[Math.floor(rand() * valid.length)];
      options.logger.info("quotePick.found", {
        at: options.at,
        userId: note.userId,
        noteId: note.id,
      });
      return { noteId: note.id, text: note.text!, userId: note.userId };
    }
  }

  options.logger.info("quotePick.skip", { at: options.at, reason: "no_suitable_notes" });
  return null;
}

import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import type { RuntimeSettings } from "./runtime-settings.js";
import { classifyQuoteSafety } from "./ai/classify-quote-safety.js";

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
  settings: RuntimeSettings;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  at: string;
  notesPerUser?: number;
  random?: () => number;
  classify?: (text: string) => Promise<boolean>;
}): Promise<QuoteCandidate | null> {
  const rand = options.random ?? Math.random;
  const notesPerUser = options.notesPerUser ?? 20;

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

  const classifyFn =
    options.classify ??
    ((text: string) =>
      classifyQuoteSafety({
        settings: options.settings,
        text,
        chutesApiKey: options.chutesApiKey,
        openaiApiKey: options.openaiApiKey,
        logger: options.logger,
      }));

  for (const user of consented) {
    const notes = await options.client.getUserNotes({
      userId: user.user_id,
      limit: notesPerUser,
    });

    const oneWeekAgo = new Date(new Date(options.at).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 構造フィルタ: CW・リプライ・リノート・非公開・1週間超・30文字未満を除外
    const structurallyValid = notes.filter(
      (n) =>
        n.text &&
        n.text.trim().length >= 30 &&
        !n.cw &&
        !n.replyId &&
        !n.renoteId &&
        (n.visibility === "public" || n.visibility === "home") &&
        n.createdAt >= oneWeekAgo
    );

    const shortNotesCount = notes.filter((n) => n.text && n.text.trim().length > 0 && n.text.trim().length < 30).length;
    if (shortNotesCount > 0) {
      options.logger.debug("quotePick.skip", {
        at: options.at,
        userId: user.user_id,
        reason: "too_short_notes",
        shortNotesCount,
        minLength: 30
      });
    }

    if (structurallyValid.length === 0) continue;

    // 今日（直近24時間）のノートを優先し、その中でランダム → 古いノートはその後
    const oneDayAgo = new Date(new Date(options.at).getTime() - 24 * 60 * 60 * 1000).toISOString();
    const todayNotes = structurallyValid.filter((n) => n.createdAt >= oneDayAgo);
    const olderNotes = structurallyValid.filter((n) => n.createdAt < oneDayAgo);
    const shuffled = [
      ...[...todayNotes].sort(() => rand() - 0.5),
      ...[...olderNotes].sort(() => rand() - 0.5),
    ];
    for (const note of shuffled) {
      const safe = await classifyFn(note.text!);
      if (safe) {
        options.logger.info("quotePick.found", {
          at: options.at,
          userId: note.userId,
          noteId: note.id,
        });
        return { noteId: note.id, text: note.text!, userId: note.userId };
      }
      options.logger.info("quotePick.unsafe", { at: options.at, noteId: note.id });
    }
  }

  options.logger.info("quotePick.skip", { at: options.at, reason: "no_safe_notes" });
  return null;
}

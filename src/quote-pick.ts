import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import type { RuntimeSettings } from "./runtime-settings.js";
import { classifyQuoteSafety } from "./ai/classify-quote-safety.js";
import { readIntegerSetting } from "./runtime-settings.js";

type ConsentedUser = { user_id: string };

export type QuoteCandidate = {
  noteId: string;
  text: string;
  userId: string;
};

export async function pickQuoteCandidate(options: {
  db: DbClient;
  client: Pick<MisskeyClient, "getHomeTimeline">;
  logger: Logger;
  settings: RuntimeSettings;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  at: string;
  random?: () => number;
  classify?: (text: string) => Promise<boolean>;
}): Promise<QuoteCandidate | null> {
  const rand = options.random ?? Math.random;
  const tlLimit = readIntegerSetting(options.settings, "QUOTE_RENOTE_TL_LIMIT", 100);
  const recentExcludeCount = readIntegerSetting(options.settings, "QUOTE_RENOTE_RECENT_USER_EXCLUDE", 5);

  // 1. 許可済みユーザー一覧
  const consented = await options.db.all<ConsentedUser>(
    `SELECT user_id FROM experience_source_consents WHERE consent_status = 'consented'`
  );
  if (consented.length === 0) {
    options.logger.info("quotePick.skip", { at: options.at, reason: "no_consented_users" });
    return null;
  }
  const consentedIds = new Set(consented.map(u => u.user_id));

  // 2. 直近N回の引用RNユーザーを除外リストに（同じユーザーへの連続引用を防ぐ）
  const recentlyQuoted = await options.db.all<{ source_user_id: string }>(
    `SELECT DISTINCT source_user_id FROM experience_logs
     WHERE experience_type = 'quote_renote' AND source_user_id IS NOT NULL
     ORDER BY occurred_at DESC LIMIT ${recentExcludeCount}`
  );
  const excludedUserIds = new Set(recentlyQuoted.map(r => r.source_user_id));

  // 3. 直近の引用済みノートIDを除外リストに（同じノートの重複引用を防ぐ）
  const recentlyQuotedNotes = await options.db.all<{ quote_source_note_id: string }>(
    `SELECT quote_source_note_id FROM posts
     WHERE kind = 'quote_renote' AND quote_source_note_id IS NOT NULL
     ORDER BY posted_at DESC LIMIT 20`
  );
  const excludedNoteIds = new Set(recentlyQuotedNotes.map(r => r.quote_source_note_id));

  // 4. ホームTLを取得
  const timeline = await options.client.getHomeTimeline({ limit: tlLimit });

  // 5. フィルタリング
  const candidates = timeline.filter(note =>
    note.text &&
    note.text.trim().length >= 30 &&
    !note.cw &&
    !note.replyId &&
    !note.renoteId &&
    (note.visibility === "public" || note.visibility === "home") &&
    consentedIds.has(note.userId) &&
    !excludedUserIds.has(note.userId) &&
    !excludedNoteIds.has(note.id)
  );

  options.logger.info("quotePick.candidates", {
    at: options.at,
    tlFetched: timeline.length,
    consentedUsers: consentedIds.size,
    excludedUsers: excludedUserIds.size,
    candidates: candidates.length,
  });

  if (candidates.length === 0) {
    options.logger.info("quotePick.skip", {
      at: options.at,
      reason: "no_candidates_in_tl",
    });
    return null;
  }

  // 6. シャッフルしてAI安全判定
  const shuffled = [...candidates].sort(() => rand() - 0.5);

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

  options.logger.info("quotePick.skip", { at: options.at, reason: "no_safe_notes" });
  return null;
}

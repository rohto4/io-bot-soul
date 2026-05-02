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

// ─── Passive Scan（蓄積なし、雰囲気判定のみ）─────────────────────────────

export async function runTlScanPassive(options: {
  db: DbClient;
  client: Pick<MisskeyClient, "getHomeTimeline">;
  logger: Logger;
  at: string;
  limit?: number;
}): Promise<TlScanResult> {
  const limit = options.limit ?? 20;
  const notes = await options.client.getHomeTimeline({ limit });

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

  options.logger.info("tlScan.passive", {
    at: options.at,
    fetched: notes.length,
    valid: valid.length,
    saved: summaries.length,
  });

  return { summaries };
}

// ─── TL雰囲気判定 ─────────────────────────────────────────────────────

/**
 * TLのsummariesから話題の偏りを判定。
 * 特定のキーワードや話題が複数回出現していれば「偏りあり」として判定。
 */
export function analyzeTlVibe(summaries: string[]): {
  hasVibe: boolean;
  dominantTopic?: string;
} {
  if (summaries.length < 3) {
    return { hasVibe: false };
  }

  // 簡易的な頻度分析：名詞っぽい単語を抽出して頻度を数える
  const wordCounts: Record<string, number> = {};
  for (const summary of summaries) {
    // 簡易的なトークン化（2文字以上の連続する日本語/英数字）
    const tokens = summary.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9]{2,}/g) ?? [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const t = token.toLowerCase();
      if (seen.has(t)) continue;
      seen.add(t);
      wordCounts[t] = (wordCounts[t] ?? 0) + 1;
    }
  }

  // 閾値：summariesの30%以上に出現する単語を「支配的話題」とする
  const threshold = Math.max(2, Math.ceil(summaries.length * 0.3));
  const candidates = Object.entries(wordCounts)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1]);

  if (candidates.length === 0) {
    return { hasVibe: false };
  }

  // 最も頻度の高い単語を支配的話題とする
  const [dominantTopic] = candidates[0]!;
  return { hasVibe: true, dominantTopic };
}



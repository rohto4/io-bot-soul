import type { DbClient } from "../db/client.js";
import type { Logger } from "../logger.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import {
  readBooleanSetting,
  readIntegerSetting,
  readNumberSetting,
  readStringSetting,
} from "../runtime-settings.js";
import { buildCharacterSystemPrompt } from "./character-spec.js";
import { callAiWithFallback } from "./chat-api.js";
import type { ChatMessage } from "./chat-api.js";

type PostRow = { text: string; posted_at: string; tier: "recent" | "mid" | "old" };
type TlNoteRow = { text_summary: string; note_created_at: string };

const systemPrompt = buildCharacterSystemPrompt([
  "## 多様性ルール（必ず守ること）",
  "- 直前の投稿と同じ書き出しの言葉・フレーズを使わない",
  "- 直前の投稿と同じ締め方（末尾の文）を使わない",
  "- 「深夜のTL」「生活ログ」「私えらいので」などの表現を毎回使わない。3回連続は禁止",
  "- 話題・感情・時間帯の切り口を変えること。観察・日常・内省・疑問・発見など引き出しを使い分ける",
]);

function formatPost(post: PostRow, maxLen: number): string {
  const date = post.posted_at.slice(0, 16);
  const text = post.text.replace(/\n/g, "｜").slice(0, maxLen);
  return `${date}: ${text}`;
}

function buildUserMessage(at: string, pastPosts: PostRow[], tlNotes: TlNoteRow[]): string {
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at}（JST目安 ${jstHour}時台）`];

  if (pastPosts.length > 0) {
    const top3 = [...pastPosts].slice(-3).reverse();
    lines.push("");
    lines.push("## 直前の投稿パターン（これと被らない書き出し・締め方にすること）");
    for (const post of top3) {
      const firstLine = post.text.split("\n")[0] ?? "";
      const lastLine = post.text.split("\n").filter(Boolean).at(-1) ?? "";
      lines.push(`- 書き出し:「${firstLine.slice(0, 30)}」 / 締め:「${lastLine.slice(0, 30)}」`);
    }

    const recentPosts = pastPosts.filter((p) => p.tier === "recent");
    const midPosts = pastPosts.filter((p) => p.tier === "mid");
    const oldPosts = pastPosts.filter((p) => p.tier === "old");

    lines.push("");
    lines.push("## これまでの投稿文脈");
    lines.push("以下はあなた自身の過去の投稿です。この蓄積と流れを踏まえた上でノートを生成してください。");

    if (recentPosts.length > 0) {
      lines.push("");
      lines.push("### 最近の記憶（直近1週間）");
      for (const post of recentPosts) lines.push(formatPost(post, 100));
    }
    if (midPosts.length > 0) {
      lines.push("");
      lines.push("### 少し前の記憶（1週間〜1ヶ月）");
      for (const post of midPosts) lines.push(formatPost(post, 80));
    }
    if (oldPosts.length > 0) {
      lines.push("");
      lines.push("### 断片的な記憶（1〜2ヶ月前）");
      for (const post of oldPosts) lines.push(formatPost(post, 60));
    }
  }

  if (tlNotes.length > 0) {
    lines.push("");
    lines.push("## 最近のタイムラインのノート（参考）");
    for (const note of tlNotes) {
      lines.push(`- ${note.text_summary.slice(0, 80)}`);
    }
  }

  lines.push("");
  lines.push("ノートを1つ生成してください。");
  return lines.join("\n");
}

export async function generatePostText(options: {
  settings: RuntimeSettings;
  db: DbClient;
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<string | null> {
  const { settings, db, at, logger } = options;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const nowMs = new Date(at).getTime();
  const recentStart = new Date(nowMs - 7 * DAY_MS).toISOString();
  const midStart = new Date(nowMs - 30 * DAY_MS).toISOString();
  const oldStart = new Date(nowMs - 60 * DAY_MS).toISOString();

  const pastPosts = await db.all<PostRow>(
    `WITH
     recent AS (
       SELECT text, posted_at, 'recent' AS tier
       FROM posts
       WHERE kind = 'normal' AND posted_at >= @recent_start
       ORDER BY posted_at DESC LIMIT 20
     ),
     mid_n AS (
       SELECT text, posted_at,
              ROW_NUMBER() OVER (ORDER BY posted_at DESC) AS rn
       FROM posts
       WHERE kind = 'normal'
         AND posted_at >= @mid_start AND posted_at < @recent_start
     ),
     mid AS (
       SELECT text, posted_at, 'mid' AS tier FROM mid_n
       WHERE (rn - 1) % 3 = 0 LIMIT 10
     ),
     old_n AS (
       SELECT text, posted_at,
              ROW_NUMBER() OVER (ORDER BY posted_at DESC) AS rn
       FROM posts
       WHERE kind = 'normal'
         AND posted_at >= @old_start AND posted_at < @mid_start
     ),
     old AS (
       SELECT text, posted_at, 'old' AS tier FROM old_n
       WHERE (rn - 1) % 10 = 0 LIMIT 5
     )
     SELECT text, posted_at, tier FROM recent
     UNION ALL SELECT text, posted_at, tier FROM mid
     UNION ALL SELECT text, posted_at, tier FROM old
     ORDER BY posted_at ASC`,
    { recent_start: recentStart, mid_start: midStart, old_start: oldStart }
  );
  const tlNotes = await db.all<TlNoteRow>(
    "SELECT text_summary, note_created_at FROM source_notes WHERE text_summary IS NOT NULL ORDER BY note_created_at DESC LIMIT 10"
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserMessage(at, pastPosts, tlNotes) },
  ];

  return callAiWithFallback(
    messages,
    {
      chutesApiKey: options.chutesApiKey,
      openaiApiKey: options.openaiApiKey,
      chutesBaseUrl: readStringSetting(settings, "CHUTES_BASE_URL", "https://llm.chutes.ai/v1"),
      chutesModel: readStringSetting(settings, "CHUTES_MODEL_TEXT", "moonshotai/Kimi-K2.5-TEE"),
      chutesTimeoutMs: readIntegerSetting(settings, "CHUTES_TIMEOUT_MS", 30000),
      openaiBaseUrl: readStringSetting(settings, "OPENAI_BASE_URL", "https://api.openai.com/v1"),
      openaiModel: readStringSetting(settings, "OPENAI_MODEL_TEXT", "gpt-4o-mini"),
      openaiTimeoutMs: readIntegerSetting(settings, "OPENAI_TIMEOUT_MS", 30000),
      maxTokens: readIntegerSetting(settings, "AI_POST_GENERATION_MAX_TOKENS", 600),
      temperature: readNumberSetting(settings, "AI_TEMPERATURE_TEXT", 0.8),
      fallbackEnabled:
        readBooleanSetting(settings, "AI_FALLBACK_ENABLED", true) &&
        readStringSetting(settings, "AI_FALLBACK_PROVIDER", "openai") === "openai",
    },
    (event, meta) => logger.info(event, meta)
  );
}

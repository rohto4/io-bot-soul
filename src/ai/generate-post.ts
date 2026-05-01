import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbClient } from "../db/client.js";
import type { Logger } from "../logger.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import {
  readBooleanSetting,
  readIntegerSetting,
  readNumberSetting,
  readStringSetting
} from "../runtime-settings.js";

type PostRow = { text: string; posted_at: string; tier: "recent" | "mid" | "old" };
type TlNoteRow = { text_summary: string; note_created_at: string };
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// docs/ から仕様セクションを取得（マーカーで範囲指定）
const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, "../..");

function readDocSection(relPath: string, startMarker: string, endMarker?: string): string {
  try {
    const content = readFileSync(join(repoRoot, relPath), "utf8");
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) return "";
    const endIdx = endMarker ? content.indexOf(endMarker, startIdx + startMarker.length) : -1;
    return (endIdx === -1 ? content.slice(startIdx) : content.slice(startIdx, endIdx)).trim();
  } catch {
    return "";
  }
}

// base-personal.md から 性格口調 テーブルと採用要約を抽出
const personalitySpec = readDocSection(
  "docs/spec/base-personal.md",
  "【性格口調】",
  "【容姿・ふるまい】"
);
const characterSummary = readDocSection(
  "docs/spec/base-personal.md",
  "## 採用要約",
  "## Q&A"
);

const systemPrompt = [
  "あなたは「涼凪かなめ」です。Misskey高校・家・図書館・ラボ・商店街・ゲーセン・近所の河原を拠点に生活するキャラクターで、日常の発見・思考（関心のあること）・感情（特に観測した事象に何を考えたかを中心に）をノートします。",
  "",
  "## キャラクター仕様（性格・口調）",
  personalitySpec,
  "",
  "## キャラクターサマリー",
  characterSummary,
  "",
  "## ノートのフォーマット",
  "- 改行は1〜2文ごとに入れる（Misskey.ioはスペースが広いので読みやすい）",
  "- 短めの投稿：2〜3行（40〜80字程度）、全体の3/4程度の頻度",
  "- 長めの投稿：4〜6行（150〜200字程度）、全体の1/4程度の頻度",
  "",
  "## 多様性ルール（必ず守ること）",
  "- 直前の投稿と同じ書き出しの言葉・フレーズを使わない",
  "- 直前の投稿と同じ締め方（末尾の文）を使わない",
  "- 「深夜のTL」「生活ログ」「私えらいので」などの表現を毎回使わない。3回連続は禁止",
  "- 話題・感情・時間帯の切り口を変えること。観察・日常・内省・疑問・発見など引き出しを使い分ける",
  "",
  "## 投稿してはいけない内容",
  "- 個人情報・他者のノート本文のコピー・paste",
  "- 重い話題・医療・投資・政治・攻撃的内容・CW・NSFW",
  "",
  "ノートのテキストのみを出力してください。前置きや説明は不要です。"
]
  .filter((s) => s !== undefined)
  .join("\n");

function formatPost(post: PostRow, maxLen: number): string {
  const date = post.posted_at.slice(0, 16);
  const text = post.text.replace(/\n/g, "｜").slice(0, maxLen);
  return `${date}: ${text}`;
}

function buildUserMessage(at: string, pastPosts: PostRow[], tlNotes: TlNoteRow[]): string {
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at}（JST目安 ${jstHour}時台）`];

  if (pastPosts.length > 0) {
    // 直近3件（配列末尾 = 最新）の書き出し・締め方を多様性制約として先に提示
    const top3 = [...pastPosts].slice(-3).reverse();
    lines.push("");
    lines.push("## 直前の投稿パターン（これと被らない書き出し・締め方にすること）");
    for (const post of top3) {
      const firstLine = post.text.split("\n")[0] ?? "";
      const lastLine = post.text.split("\n").filter(Boolean).at(-1) ?? "";
      lines.push(`- 書き出し:「${firstLine.slice(0, 30)}」 / 締め:「${lastLine.slice(0, 30)}」`);
    }

    // 過去投稿の文脈を3段階で提示（SQLがASCで返すのでそのまま時系列順）
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

async function callChatApi(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  maxTokensField: "max_tokens" | "max_completion_tokens";
}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        [options.maxTokensField]: options.maxTokens,
        temperature: options.temperature
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(timer);
  }
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

  // tiered sampling を SQL だけで実現:
  //   直近7日   → 最大20件（全量）
  //   7〜30日   → 3件おき、最大10件
  //   30〜60日  → 10件おき、最大5件
  // 結果は posted_at ASC で返る
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
    { role: "user", content: buildUserMessage(at, pastPosts, tlNotes) }
  ];

  const maxTokens = readIntegerSetting(settings, "AI_POST_GENERATION_MAX_TOKENS", 600);
  const temperature = readNumberSetting(settings, "AI_TEMPERATURE_TEXT", 0.8);
  const primaryProvider = readStringSetting(settings, "AI_PRIMARY_PROVIDER", "chutes");

  if (primaryProvider === "chutes") {
    if (!options.chutesApiKey) {
      logger.warn("generatePost.skip", { provider: "chutes", reason: "no_api_key" });
    } else {
      const baseUrl = readStringSetting(settings, "CHUTES_BASE_URL", "https://llm.chutes.ai/v1");
      const model = readStringSetting(settings, "CHUTES_MODEL_TEXT", "moonshotai/Kimi-K2.5-TEE");
      const timeoutMs = readIntegerSetting(settings, "CHUTES_TIMEOUT_MS", 30000);
      try {
        const text = await callChatApi({
          baseUrl,
          apiKey: options.chutesApiKey,
          model,
          messages,
          maxTokens,
          temperature,
          timeoutMs,
          maxTokensField: "max_tokens"
        });
        if (text) {
          logger.info("generatePost.done", { provider: "chutes", model });
          return text;
        }
      } catch (error: unknown) {
        logger.warn("generatePost.error", { provider: "chutes", error: String(error) });
      }
    }
  }

  const fallbackEnabled = readBooleanSetting(settings, "AI_FALLBACK_ENABLED", true);
  const fallbackProvider = readStringSetting(settings, "AI_FALLBACK_PROVIDER", "openai");

  if (fallbackEnabled && fallbackProvider === "openai") {
    if (!options.openaiApiKey) {
      logger.warn("generatePost.skip", { provider: "openai", reason: "no_api_key" });
    } else {
      const baseUrl = readStringSetting(settings, "OPENAI_BASE_URL", "https://api.openai.com/v1");
      const model = readStringSetting(settings, "OPENAI_MODEL_TEXT", "gpt-4o-mini");
      const timeoutMs = readIntegerSetting(settings, "OPENAI_TIMEOUT_MS", 30000);
      try {
        const text = await callChatApi({
          baseUrl,
          apiKey: options.openaiApiKey,
          model,
          messages,
          maxTokens,
          temperature,
          timeoutMs,
          maxTokensField: "max_completion_tokens"
        });
        if (text) {
          logger.info("generatePost.done", { provider: "openai", model });
          return text;
        }
      } catch (error: unknown) {
        logger.warn("generatePost.error", { provider: "openai", error: String(error) });
      }
    }
  }

  logger.warn("generatePost.failed", { primaryProvider, fallbackEnabled, fallbackProvider });
  return null;
}

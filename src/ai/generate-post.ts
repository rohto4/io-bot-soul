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

type PostRow = { text: string; posted_at: string };
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
  "あなたは「涼凪かなめ」です。Misskey.ioで活動するキャラクターで、タイムラインを観察し、気になったことを「生活ログ」として記録・投稿しています。",
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
  "## 投稿例（短め）",
  "生活ログを確認してる。\n今日は面白いノートがいくつかあった。\nいい感じ。",
  "",
  "## 投稿例（長め）",
  "さっきから面白い流れのノートを追ってた。\n生活ログに記録しようとしたら、\nいつの間にか全然別の話になってた。\nこういうの、記録の脱線って言うんだろうか。\nまあいいや、全部残しておく。\n余白は多い方がいいと思ってる。",
  "",
  "ノートのテキストのみを出力してください。前置きや説明は不要です。"
]
  .filter((s) => s !== undefined)
  .join("\n");

function buildUserMessage(at: string, pastPosts: PostRow[], tlNotes: TlNoteRow[]): string {
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at}（JST目安 ${jstHour}時台）`];

  if (pastPosts.length > 0) {
    // 直近3件の書き出し・締め方を明示して回避させる
    const recent = pastPosts.slice(0, 3);
    lines.push("");
    lines.push("## 直前の投稿パターン（これと被らない書き出し・締め方にすること）");
    for (const post of recent) {
      const firstLine = post.text.split("\n")[0] ?? "";
      const lastLine = post.text.split("\n").filter(Boolean).at(-1) ?? "";
      lines.push(`- 書き出し:「${firstLine.slice(0, 30)}」 / 締め:「${lastLine.slice(0, 30)}」`);
    }

    lines.push("");
    lines.push(`## 自分の過去の投稿（記憶として参照、直近${pastPosts.length}件）`);
    // 古い順に並べて LLM が時系列で読めるようにする
    for (const post of [...pastPosts].reverse()) {
      const date = post.posted_at.slice(0, 16);
      const text = post.text.replace(/\n/g, "｜").slice(0, 100);
      lines.push(`${date}: ${text}`);
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

  // 過去投稿を多めに読み込む（デフォルト100件）
  const historyLimit = Math.max(1, readIntegerSetting(settings, "AI_POST_HISTORY_LIMIT", 100));
  const pastPosts = await db.all<PostRow>(
    `SELECT text, posted_at FROM posts WHERE kind = 'normal' ORDER BY posted_at DESC LIMIT ${historyLimit}`
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

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
  "## 投稿例（朝・機嫌よい）",
  "今日の朝、珍しくすっきり起きた。\n頭が動く時間にやりたいことが多すぎて、\nまず何からにしようか迷ってる。それはそれで悪くない。",
  "",
  "## 投稿例（ラボ・調べ物）",
  "ちょっと気になったことを調べ始めたら、\n全然関係ない話に着地した。\nこういう脱線、なぜか嫌いになれない。",
  "",
  "## 投稿例（日常・カップ麺系）",
  "カップ麺の待ち時間、3分ってちょうどいいな。\n考えがまとまるには短くて、冷めるには長い。\n絶妙。",
  "",
  "## 投稿例（夜・収集・自己肯定）",
  "今日の実績解除、地味に嬉しいやつだった。\n誰も気づかないくらい細かい達成感、\n私えらいので今日もログに残しておく。",
  "",
  "## 投稿例（長め・発見が広がる）",
  "商店街の端の店、前から気になってたやつにやっと入れた。\n思ってたより全然種類が多くて、\nなんか一個買ったら店主にめちゃ説明された。\nここで得た知識、活用できる場面が全く思い浮かばないけど、\nまあいいや。おもしろかったので。",
  "",
  "ノートのテキストのみを出力してください。前置きや説明は不要です。"
]
  .filter((s) => s !== undefined)
  .join("\n");

type WeightedMemory = {
  recent: PostRow[];  // 直近7日: 最大20件
  mid: PostRow[];     // 7〜30日: 3件おき、最大10件
  old: PostRow[];     // 30〜60日: 10件おき、最大5件
};

function buildWeightedMemory(posts: PostRow[], at: string): WeightedMemory {
  const now = new Date(at).getTime();
  const DAY = 24 * 60 * 60 * 1000;

  const recentRaw: PostRow[] = [];
  const midRaw: PostRow[] = [];
  const oldRaw: PostRow[] = [];

  for (const post of posts) {
    const ageMs = now - new Date(post.posted_at).getTime();
    if (ageMs < 7 * DAY) recentRaw.push(post);
    else if (ageMs < 30 * DAY) midRaw.push(post);
    else oldRaw.push(post);
  }

  return {
    recent: recentRaw.slice(0, 20),
    mid: midRaw.filter((_, i) => i % 3 === 0).slice(0, 10),
    old: oldRaw.filter((_, i) => i % 10 === 0).slice(0, 5)
  };
}

function formatPost(post: PostRow, maxLen: number): string {
  const date = post.posted_at.slice(0, 16);
  const text = post.text.replace(/\n/g, "｜").slice(0, maxLen);
  return `${date}: ${text}`;
}

function buildUserMessage(at: string, pastPosts: PostRow[], tlNotes: TlNoteRow[]): string {
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at}（JST目安 ${jstHour}時台）`];

  if (pastPosts.length > 0) {
    // 直近3件の書き出し・締め方を多様性制約として先に提示
    const top3 = pastPosts.slice(0, 3);
    lines.push("");
    lines.push("## 直前の投稿パターン（これと被らない書き出し・締め方にすること）");
    for (const post of top3) {
      const firstLine = post.text.split("\n")[0] ?? "";
      const lastLine = post.text.split("\n").filter(Boolean).at(-1) ?? "";
      lines.push(`- 書き出し:「${firstLine.slice(0, 30)}」 / 締め:「${lastLine.slice(0, 30)}」`);
    }

    // 重みづけされた記憶を3段階で提示（古い順に並べて時系列で読めるようにする）
    const mem = buildWeightedMemory(pastPosts, at);

    if (mem.recent.length > 0) {
      lines.push("");
      lines.push("## 最近の記憶（直近1週間）");
      for (const post of [...mem.recent].reverse()) {
        lines.push(formatPost(post, 100));
      }
    }
    if (mem.mid.length > 0) {
      lines.push("");
      lines.push("## 少し前の記憶（1週間〜1ヶ月）");
      for (const post of [...mem.mid].reverse()) {
        lines.push(formatPost(post, 80));
      }
    }
    if (mem.old.length > 0) {
      lines.push("");
      lines.push("## 断片的な記憶（1〜2ヶ月前）");
      for (const post of [...mem.old].reverse()) {
        lines.push(formatPost(post, 60));
      }
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

  // 過去2ヶ月分を取得してtiered samplingで渡す
  const twoMonthsAgo = new Date(new Date(at).getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const pastPosts = await db.all<PostRow>(
    "SELECT text, posted_at FROM posts WHERE kind = 'normal' AND posted_at >= @since ORDER BY posted_at DESC",
    { since: twoMonthsAgo }
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

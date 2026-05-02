import type { DbClient } from "../db/client.js";
import type { Logger } from "../logger.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import type { NoteHint } from "../note-hint.js";
import {
  readBooleanSetting,
  readIntegerSetting,
  readNumberSetting,
  readStringSetting,
} from "../runtime-settings.js";
import { buildCharacterSystemPrompt } from "./character-spec.js";
import { callAiWithFallback } from "./chat-api.js";
import type { ChatMessage } from "./chat-api.js";

type PostRow = { text: string; posted_at: string; tier: "recent" | "mid" | "old"; kind: string };
type TlNoteRow = { text_summary: string; note_created_at: string };

const systemPrompt = buildCharacterSystemPrompt([
  "## 多様性ルール（必ず守ること）",
  "- 直前の投稿と同じ書き出しの言葉・フレーズを使わない",
  "- 直前の投稿と同じ締め方（末尾の文）を使わない",
  "- 「深夜のTL」「生活ログ」「私えらいので」などの表現を毎回使わない。3回連続は禁止",
  "- 話題・感情・時間帯の切り口を変えること。観察・日常・内省・疑問・発見など引き出しを使い分ける",
]);

const kindLabel: Record<string, string> = {
  normal: "",
  tl_observation: "[TL観測] ",
  quote_renote: "[引用RN] ",
};

function formatPost(post: PostRow, maxLen: number): string {
  const date = post.posted_at.slice(0, 16);
  const label = kindLabel[post.kind] ?? "";
  const text = post.text.replace(/\n/g, "｜").slice(0, maxLen);
  return `${date}: ${label}${text}`;
}

function buildUserMessage(options: {
  at: string;
  top3: PostRow[];          // 多様性制約用（常に渡す）
  tieredPosts: PostRow[];   // reminisce/reference用（normalでは空）
  refPost?: PostRow;        // reference用（1件のみ）
  tlNotes: TlNoteRow[];
  hint?: NoteHint;
}): string {
  const { at, top3, tieredPosts, refPost, tlNotes, hint } = options;
  const depth = hint?.memoryDepth ?? "normal";
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at}（JST目安 ${jstHour}時台）`];

  // 常に: 直前パターンで多様性制約
  if (top3.length > 0) {
    lines.push("");
    lines.push("## 直前の投稿パターン（これと被らない書き出し・締め方にすること）");
    for (const post of top3) {
      const firstLine = post.text.split("\n")[0] ?? "";
      const lastLine = post.text.split("\n").filter(Boolean).at(-1) ?? "";
      lines.push(`- 書き出し:「${firstLine.slice(0, 30)}」 / 締め:「${lastLine.slice(0, 30)}」`);
    }
  }

  // reminisce: ランダム5件から連想
  if (depth === "reminisce" && tieredPosts.length > 0) {
    lines.push("");
    lines.push("## 過去の投稿からの連想（直接引用・繰り返しはしないこと）");
    lines.push("以下の過去の投稿をきっかけに、何か連想・発展させたことをノートしてください。");
    for (const post of tieredPosts) lines.push(formatPost(post, 100));
  }

  // reference: 特定の1件に言及
  if (depth === "reference" && refPost) {
    lines.push("");
    lines.push("## 過去の自分のノートへの言及");
    lines.push("以下はあなたが以前書いたノートです。このノートを踏まえた反応・続き・補足をノートしてください。");
    lines.push(`（${refPost.posted_at.slice(0, 16)} / ${kindLabel[refPost.kind] ?? ""}）`);
    lines.push(`「${refPost.text.replace(/\n/g, "｜").slice(0, 150)}」`);
  }

  // TLノート参考（全depthで表示）
  if (tlNotes.length > 0) {
    lines.push("");
    lines.push("## 最近のタイムラインのノート（参考）");
    for (const note of tlNotes) {
      lines.push(`- ${note.text_summary.slice(0, 80)}`);
    }
  }

  // ヒント
  if (hint) {
    lines.push("");
    lines.push("## 今回のノートのヒント（お題の種・口調の向き）");
    lines.push(`お題の種: ${hint.topic}`);
    lines.push(`口調の向き: ${hint.tone}`);
    if (hint.style) {
      lines.push("");
      lines.push(`## 文体・構成パターン: ${hint.style.name}`);
      lines.push(hint.style.description);
      lines.push("");
      lines.push("構成の参考例（内容はお題に合わせて変えること）:");
      lines.push(hint.style.example);
    }
    lines.push("");
    lines.push("これをヒントにかなめとしてノートを1つ書いてください。ヒントをそのまま言葉にするのではなく、自然に織り込んでください。");
  } else {
    lines.push("");
    lines.push("ノートを1つ生成してください。");
  }
  return lines.join("\n");
}

export async function generatePostText(options: {
  settings: RuntimeSettings;
  db: DbClient;
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
  hint?: NoteHint;
}): Promise<string | null> {
  const { settings, db, at, logger } = options;
  const depth = options.hint?.memoryDepth ?? "normal";

  // 常に: 多様性制約用の直近3件
  const top3 = await db.all<PostRow>(
    `SELECT text, posted_at, kind, 'recent' AS tier
     FROM posts
     WHERE kind IN ('normal','tl_observation','quote_renote')
     ORDER BY posted_at DESC LIMIT 3`
  );

  // reminisce / reference のみ: tiered 記憶を取得
  let tieredPosts: PostRow[] = [];
  let refPost: PostRow | undefined;

  if (depth !== "normal") {
    const oldStart = new Date(new Date(at).getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const limit = depth === "reference" ? 1 : 5;

    tieredPosts = await db.all<PostRow>(
      `SELECT text, posted_at, kind, 'recent' AS tier
       FROM posts
       WHERE kind IN ('normal','tl_observation','quote_renote')
         AND posted_at >= @oldStart
       ORDER BY RANDOM() LIMIT ${limit}`,
      { oldStart }
    );

    if (depth === "reference") {
      refPost = tieredPosts[0];
    }
  }

  const tlNotes = await db.all<TlNoteRow>(
    "SELECT text_summary, note_created_at FROM source_notes WHERE text_summary IS NOT NULL ORDER BY note_created_at DESC LIMIT 10"
  );

  logger.info("generatePost.memoryDepth", { at, depth });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserMessage({ at, top3, tieredPosts, refPost, tlNotes, hint: options.hint }) },
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

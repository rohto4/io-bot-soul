import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
type ExperienceLogRow = { occurred_at: string; summary: string; experience_type: string };

const systemPrompt = buildCharacterSystemPrompt([
  "## 多様性ルール（必ず守ること）",
  "- 直前の投稿と同じ書き出しの言葉・フレーズを使わない",
  "- 直前の投稿と同じ締め方（末尾の文）を使わない",
  "- 「深夜のTL」「生活ログ」「私えらいので」などの特定フレーズ: 直近2件に含まれている場合は今回使わない",
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
  top3: PostRow[];
  tieredPosts: PostRow[];
  refPost?: PostRow;
  tlNotes: TlNoteRow[];
  hint?: NoteHint;
  tlSummaries?: string[];
  tlMode?: "no_tl" | "vibe" | "mention";
  dominantTopic?: string;
  experienceLogs?: ExperienceLogRow[];
  experienceWeight?: number;
}): string {
  const { at, top3, tieredPosts, refPost, tlNotes, hint, tlSummaries, tlMode, dominantTopic, experienceLogs, experienceWeight = 50 } = options;
  const depth = hint?.memoryDepth ?? "normal";
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at}（JST目安 ${jstHour}時台）`];

  // 常に: 直前投稿を全文表示して文体・構成・流れごと回避させる
  if (top3.length > 0) {
    lines.push("");
    lines.push("## 直前の投稿（文体・構成・行数・締め方・フレーズすべて変えること）");
    for (const post of top3.slice(0, 2)) {
      lines.push(`[${post.posted_at.slice(0, 16)}]`);
      lines.push(post.text.slice(0, 200));
      lines.push("");
    }

    // 直近2件の締め方に特定フレーズが含まれていれば今回の禁止フレーズとして明示する
    const watchPhrases = ["私えらいので", "生活ログ", "深夜のTL"];
    const recentEndings = top3.slice(0, 2).map(p => p.text.split("\n").filter(Boolean).at(-1) ?? "");
    const banned = watchPhrases.filter(phrase => recentEndings.some(e => e.includes(phrase)));
    if (banned.length > 0) {
      lines.push(`※ 今回の締め方でこれらは使わないこと: ${banned.map(b => `「${b}〜」`).join(" / ")}`);
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

  // 体験メモリ（最近の記録）
  if (experienceLogs && experienceLogs.length > 0 && experienceWeight > 0) {
    lines.push("");
    // 影響度に応じてセクション名を変化
    if (experienceWeight >= 75) {
      lines.push("## 最近の記録（かなめが体験したこと）");
      for (const log of experienceLogs) {
        lines.push(`- ${log.occurred_at.slice(0, 16)}: ${log.summary}`);
      }
      lines.push("これらを参考に、かなめとしてノートを書いてください。");
    } else if (experienceWeight >= 50) {
      lines.push("## 最近の記録（かなめが体験したこと）");
      for (const log of experienceLogs) {
        lines.push(`- ${log.occurred_at.slice(0, 16)}: ${log.summary}`);
      }
      lines.push("これらを無意識に参照して、かなめとしてノートを書いてください。");
    } else {
      lines.push("## 最近の記録");
      for (const log of experienceLogs) {
        lines.push(`- ${log.summary}`);
      }
    }
  }

  // TL参照（vibe/mentionモード）
  if (tlMode && tlMode !== "no_tl" && tlSummaries && tlSummaries.length > 0) {
    lines.push("");
    if (tlMode === "vibe") {
      lines.push("## 今のタイムラインの雰囲気");
      lines.push("最近のタイムラインには、こんな流れがあった：");
      for (const s of tlSummaries.slice(0, 5)) {
        lines.push(`- ${s}`);
      }
      if (dominantTopic) {
        lines.push("");
        lines.push(`「${dominantTopic}」についての話題が多い気がする。`);
        lines.push("この雰囲気をぼんやり感じ取って、かなめとしてノートを書いてください。特定の人を名指ししないでください。");
      }
    } else if (tlMode === "mention") {
      lines.push("## 気になったこと");
      lines.push("タイムラインでこんな話題を見かけた：");
      for (const s of tlSummaries.slice(0, 3)) {
        lines.push(`- ${s}`);
      }
      if (dominantTopic) {
        lines.push("");
        lines.push(`${dominantTopic}について、少し言及してみてください。特定の人を名指ししないでください。`);
      }
    }
  }

  // TLノート参考（全depthで表示、tlModeがない場合）
  if ((!tlMode || tlMode === "no_tl") && tlNotes.length > 0) {
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
      lines.push("各行の役割（内容はお題から自由に作ること。この型の言葉は使わないこと）:");
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
  tlSummaries?: string[];
  tlMode?: "no_tl" | "vibe" | "mention";
  dominantTopic?: string;
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

  // TLノート参照（no_tlの時のみ）
  const tlNotes = (!options.tlMode || options.tlMode === "no_tl")
    ? await db.all<TlNoteRow>(
        "SELECT text_summary, note_created_at FROM source_notes WHERE text_summary IS NOT NULL ORDER BY note_created_at DESC LIMIT 10"
      )
    : [];

  // 体験メモリ取得
  let experienceLogs: ExperienceLogRow[] = [];
  let experienceWeight = 0;
  if (readBooleanSetting(settings, "EXPERIENCE_MEMORY_ENABLED", true)) {
    const sampleCount = readIntegerSetting(settings, "EXPERIENCE_MEMORY_SAMPLE_COUNT", 50);
    experienceWeight = readIntegerSetting(settings, "EXPERIENCE_MEMORY_PROMPT_WEIGHT", 50);
    if (sampleCount > 0 && experienceWeight > 0) {
      experienceLogs = await db.all<ExperienceLogRow>(
        `SELECT occurred_at, summary, experience_type
         FROM experience_logs
         ORDER BY RANDOM() LIMIT ${sampleCount}`
      );
      logger.info("generatePost.experienceMemory", { at, sampleCount, logsCount: experienceLogs.length, weight: experienceWeight });
    }
  }

  logger.info("generatePost.memoryDepth", { at, depth, tlMode: options.tlMode ?? "no_tl", experienceWeight });

  const userMessage = buildUserMessage({
    at,
    top3,
    tieredPosts,
    refPost,
    tlNotes,
    hint: options.hint,
    tlSummaries: options.tlSummaries,
    tlMode: options.tlMode,
    dominantTopic: options.dominantTopic,
    experienceLogs,
    experienceWeight,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  // デバッグ: プロンプトをファイルに書き出す
  if (readBooleanSetting(settings, "DEBUG_STATUS", false)) {
    try {
      const debugDir = join(process.cwd(), "data", "debug");
      await mkdir(debugDir, { recursive: true });
      const filename = `prompt_${at.replace(/[:.]/g, "-")}.txt`;
      const content = [
        `=== DEBUG PROMPT: ${at} ===`,
        `=== depth=${depth} | tlMode=${options.tlMode ?? "no_tl"} | experienceWeight=${experienceWeight} ===`,
        "",
        "[SYSTEM]",
        systemPrompt,
        "",
        "[USER]",
        userMessage,
        "",
        "=== END ===",
      ].join("\n");
      await writeFile(join(debugDir, filename), content, "utf8");
      logger.info("generatePost.debugPromptWritten", { at, file: filename });
    } catch (e) {
      logger.info("generatePost.debugPromptError", { at, error: String(e) });
    }
  }

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

import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import type { RuntimeSettings } from "./runtime-settings.js";
import { generatePostText } from "./ai/generate-post.js";
import { generateQuotePostText } from "./ai/generate-quote-post.js";
import {
  loadRuntimeSettings,
  readBooleanSetting,
  readIntegerSetting,
  readNumberSetting,
} from "./runtime-settings.js";
import { runTlScanPassive, analyzeTlVibe } from "./tl-scan.js";
import { pickQuoteCandidate } from "./quote-pick.js";
import type { QuoteCandidate } from "./quote-pick.js";
import { drawNoteHint } from "./note-hint.js";
import type { NoteHint } from "./note-hint.js";

type ScheduledPostClient = Pick<MisskeyClient, "createNote" | "getHomeTimeline" | "getUserNotes">;

export type ScheduledPostDrawOptions = {
  db: DbClient;
  logger: Logger;
  client: ScheduledPostClient;
  at: string;
  enabled: boolean;
  random?: () => number;
  // テスト用モック差し込み口
  generateText?: (opts: { tlMode?: "no_tl" | "vibe" | "mention"; tlSummaries?: string[]; dominantTopic?: string; hint?: NoteHint }) => Promise<string | null>;
  generateQuoteText?: (noteText: string) => Promise<string | null>;
  pickQuote?: () => Promise<QuoteCandidate | null>;
};

// ─── fallback テンプレート ────────────────────────────────────────────

const shortPostTemplates = [
  "生活ログを確認してる。\n今日は面白いノートがいくつかあった。\nいい感じ。",
  "生活ログを同期したよ。\n気になるものが増えてるのは\n悪くないと思ってる。",
  "生活ログ更新中。\n今日も観察がはかどった。\nこういう日が続くといい。",
  "生活ログ、特に異常なし。\nもう少し起きながら、\n次の記録を探してる。",
] as const;

const longPostTemplates = [
  "今日の生活ログ、面白い記録が増えた。\n気になるノートを追ってたら、\nどんどん関連する話が出てきてとまらなくなった。\nこういうふうに記録が広がっていくの、\n結構好きかもしれない。\nまだ眠くないので、もう少し続ける。",
  "体験候補リストに新しいのを追加した。\n行けるかどうかはまだわからないけど、\n候補があるだけで気持ちが少し動く感じがある。\n生活ログに「いつか行きたい」が増えていくの、\nなんか悪くないな、と思ってる。",
  "たまに、ここの外がどんな感じか気になる。\n生活ログを見てると、自分の観測範囲って\nわりと狭いな、ってなるんだけど、\nその分ここで起きてることを\nじっくり記録できてるってことでもある。\n悪くない、と思ってる。",
  "さっきから面白い流れのノートを追ってた。\n生活ログに記録しようとしたら、\nいつの間にか全然別の話になってた。\nこういうの、記録の脱線って言うんだろうか。\nまあいいや、全部残しておく。\n余白は多い方がいいと思ってる。",
] as const;

export function buildScheduledPostText(random: () => number = Math.random): string {
  const pool = random() < 0.25 ? longPostTemplates : shortPostTemplates;
  return pool[Math.floor(random() * pool.length)];
}

// ─── 確率テーブル ─────────────────────────────────────────────────────

type ProbabilityPoint = { elapsedMinutes: number; probability: number };

const defaultProbabilityPoints: ProbabilityPoint[] = [
  { elapsedMinutes: 5, probability: 0.1 },
  { elapsedMinutes: 10, probability: 0.15 },
  { elapsedMinutes: 30, probability: 0.8 },
  { elapsedMinutes: 60, probability: 0.95 },
];

export function calculateScheduledPostProbability(input: {
  elapsedMinutes: number;
  minIntervalMinutes: number;
  points?: ProbabilityPoint[];
}): number {
  if (input.elapsedMinutes < input.minIntervalMinutes) return 0;

  const points = input.points ?? defaultProbabilityPoints;
  const first = points[0];
  if (!first) return 1;
  if (input.elapsedMinutes <= first.elapsedMinutes) return first.probability;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (input.elapsedMinutes <= curr.elapsedMinutes) {
      const progress = (input.elapsedMinutes - prev.elapsedMinutes) / (curr.elapsedMinutes - prev.elapsedMinutes);
      return prev.probability + (curr.probability - prev.probability) * progress;
    }
  }

  return points[points.length - 1].probability;
}

// ─── Phase 1: ガチャ ──────────────────────────────────────────────────

type DrawSkip = { tag: "skip"; reason: string; meta?: Record<string, unknown> };
type DrawQuoteRn = { tag: "quote_rn" };
type DrawNormal = { tag: "normal"; hint: NoteHint; tlMode: "no_tl" | "vibe" | "mention"; summaries?: string[]; dominantTopic?: string };
type DrawResult = DrawSkip | DrawQuoteRn | DrawNormal;

function drawAction(
  settings: RuntimeSettings,
  rand: () => number,
  latestNormal: { posted_at: string } | undefined,
  at: string
): DrawResult {
  const beta = readBooleanSetting(settings, "BETA_TEST1_ENABLED", false);

  // 引用RN確率
  const quoteRnProb = beta ? 0.40 : readNumberSetting(settings, "QUOTE_RENOTE_PROBABILITY", 0.20);

  // 独立ガチャ: 引用RN
  if (rand() < quoteRnProb) {
    return { tag: "quote_rn" };
  }

  // 通常ノート: 最短間隔 + 確率テーブル
  const elapsedMult = beta ? 5.0 : 1.0;
  if (latestNormal) {
    const minInterval = readIntegerSetting(settings, "SCHEDULED_POST_MIN_INTERVAL_MINUTES", 5);
    const elapsedMs = new Date(at).getTime() - new Date(latestNormal.posted_at).getTime();
    const elapsedMinutes = (elapsedMs / 60 / 1000) * elapsedMult;

    if (elapsedMs < minInterval * 60 * 1000) {
      return { tag: "skip", reason: "min_interval", meta: { latestPostedAt: latestNormal.posted_at } };
    }

    const points = [
      { elapsedMinutes: 5,  probability: readNumberSetting(settings, "POST_PROBABILITY_5_MIN",  0.1)  },
      { elapsedMinutes: 10, probability: readNumberSetting(settings, "POST_PROBABILITY_10_MIN", 0.15) },
      { elapsedMinutes: 30, probability: readNumberSetting(settings, "POST_PROBABILITY_30_MIN", 0.8)  },
      { elapsedMinutes: 60, probability: readNumberSetting(settings, "POST_PROBABILITY_60_MIN", 0.95) },
    ];
    const probability = calculateScheduledPostProbability({ elapsedMinutes, minIntervalMinutes: minInterval, points });
    const draw = rand();

    if (draw >= probability) {
      return { tag: "skip", reason: "probability", meta: { latestPostedAt: latestNormal.posted_at, elapsedMinutes, probability, draw } };
    }
  }

  // 通常ノートのTL参照判定
  const tlRefProb = readNumberSetting(settings, "TL_REFERENCE_PROBABILITY", 0.50);
  const hint = drawNoteHint(rand);

  if (rand() < tlRefProb) {
    // TL参照当選 → 雰囲気/特定抽選
    const vibeRatio = readNumberSetting(settings, "TL_VIBE_RATIO", 0.75);
    const tlMode: "vibe" | "mention" = rand() < vibeRatio ? "vibe" : "mention";
    return { tag: "normal", hint, tlMode };
  }

  return { tag: "normal", hint, tlMode: "no_tl" };
}

// ─── Phase 2: 取得 ────────────────────────────────────────────────────

type FetchSkip = { tag: "skip"; reason: string };
type FetchQuoteRn = { tag: "quote_rn"; candidate: QuoteCandidate; summaries: string[] };
type FetchNormal = { tag: "normal"; hint: NoteHint; tlMode: "no_tl" | "vibe" | "mention"; summaries: string[]; dominantTopic?: string };
type FetchResult = FetchSkip | FetchQuoteRn | FetchNormal;

async function fetchData(
  draw: DrawQuoteRn | DrawNormal,
  settings: RuntimeSettings,
  options: ScheduledPostDrawOptions,
  rand: () => number
): Promise<FetchResult> {
  if (draw.tag === "normal") {
    if (draw.tlMode === "no_tl") {
      return { tag: "normal", hint: draw.hint, tlMode: "no_tl", summaries: [] };
    }

    // TL参照モード: TLスキャン + 傾向分析
    const tlLimit = readIntegerSetting(settings, "TL_OBSERVATION_NOTE_COUNT", 20);
    const minSummaries = readIntegerSetting(settings, "TL_OBSERVATION_MIN_POSTS", 3);

    const { summaries } = await runTlScanPassive({
      db: options.db,
      client: options.client,
      logger: options.logger,
      at: options.at,
      limit: tlLimit,
    });

    if (summaries.length < minSummaries) {
      // TL参照に必要なsummariesが足りない → no_tl にフォールバック
      options.logger.info("scheduledPost.tlFallback", { at: options.at, reason: "too_few_summaries", tlMode: draw.tlMode });
      return { tag: "normal", hint: draw.hint, tlMode: "no_tl", summaries: [] };
    }

    const { hasVibe, dominantTopic } = analyzeTlVibe(summaries);

    if (!hasVibe && draw.tlMode === "vibe") {
      // 雰囲気がない → no_tl にフォールバック
      options.logger.info("scheduledPost.tlFallback", { at: options.at, reason: "no_dominant_vibe", tlMode: draw.tlMode });
      return { tag: "normal", hint: draw.hint, tlMode: "no_tl", summaries: [] };
    }

    return { tag: "normal", hint: draw.hint, tlMode: draw.tlMode, summaries, dominantTopic };
  }

  // quote_rn: 引用候補を取得
  const tlLimit = readIntegerSetting(settings, "TL_OBSERVATION_NOTE_COUNT", 20);

  const { summaries } = await runTlScanPassive({
    db: options.db,
    client: options.client,
    logger: options.logger,
    at: options.at,
    limit: tlLimit,
  });

  const quoteFn =
    options.pickQuote ??
    (() =>
      pickQuoteCandidate({
        db: options.db,
        client: options.client,
        logger: options.logger,
        settings,
        chutesApiKey: process.env.CHUTES_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        at: options.at,
        random: rand,
      }));

  const candidate = await quoteFn();

  if (candidate) return { tag: "quote_rn", candidate, summaries };

  // 候補なし → skip（通常ノートへは落ちない）
  options.logger.info("quoteRenote.skip", { at: options.at, reason: "no_candidate" });
  return { tag: "skip", reason: "no_quote_candidate" };
}

// ─── Phase 3: AI生成・投稿 ────────────────────────────────────────────

async function generateAndPost(
  fetch: FetchQuoteRn | FetchNormal,
  settings: RuntimeSettings,
  options: ScheduledPostDrawOptions
): Promise<void> {
  // ── quote_rn ──
  if (fetch.tag === "quote_rn") {
    const quoteGenerateFn =
      options.generateQuoteText ??
      ((noteText: string) =>
        generateQuotePostText({
          settings,
          noteText,
          at: options.at,
          chutesApiKey: process.env.CHUTES_API_KEY,
          openaiApiKey: process.env.OPENAI_API_KEY,
          logger: options.logger,
        }));

    const quoteText = await quoteGenerateFn(fetch.candidate.text);

    if (quoteText) {
      const visibility = "public";
      const note = await options.client.createNote({ text: quoteText, renoteId: fetch.candidate.noteId, visibility });
      await options.db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, quote_source_note_id, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'quote_renote', @text, @visibility, @sourceNoteId, 'quote_renote', @createdAt)`,
        { noteId: note.id, postedAt: options.at, text: quoteText, visibility, sourceNoteId: fetch.candidate.noteId, createdAt: options.at }
      );
      options.logger.info("quoteRenote.posted", { at: options.at, noteId: note.id, sourceNoteId: fetch.candidate.noteId });
      // 引用RNを体験として記録
      await options.db.run(
        `INSERT INTO experience_logs
           (occurred_at, source_note_id, source_user_id, experience_type,
            summary, importance, posted_note_id, created_at)
         VALUES (@occurredAt, @sourceNoteId, @sourceUserId, 'quote_renote',
                 @summary, 1, @postedNoteId, @createdAt)`,
        {
          occurredAt: options.at,
          sourceNoteId: fetch.candidate.noteId,
          sourceUserId: fetch.candidate.userId,
          summary: fetch.candidate.text.replace(/\n/g, " ").slice(0, 120),
          postedNoteId: note.id,
          createdAt: options.at,
        }
      );
      return;
    }

    // AI 失敗 → skip（通常ノートへは落ちない）
    options.logger.info("quoteRenote.skip", { at: options.at, reason: "ai_failure" });
    return;
  }

  // ── normal ──
  const generateFn =
    options.generateText ??
    ((opts: { tlMode?: "no_tl" | "vibe" | "mention"; tlSummaries?: string[]; dominantTopic?: string; hint?: NoteHint }) =>
      generatePostText({
        settings,
        db: options.db,
        at: options.at,
        chutesApiKey: process.env.CHUTES_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        logger: options.logger,
        hint: opts.hint ?? fetch.hint,
        tlSummaries: opts.tlSummaries ?? fetch.summaries,
        tlMode: opts.tlMode ?? fetch.tlMode,
        dominantTopic: opts.dominantTopic ?? fetch.dominantTopic,
      }));

  const aiText = await generateFn({
    tlMode: fetch.tlMode,
    tlSummaries: fetch.summaries,
    dominantTopic: fetch.dominantTopic,
    hint: fetch.hint,
  });

  if (aiText === null && readBooleanSetting(settings, "AI_SKIP_POST_ON_AI_FAILURE", true)) {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: "ai_failure", tlMode: fetch.tlMode });
    return;
  }

  const text = aiText ?? buildScheduledPostText(options.random);
  const visibility = "public";
  const note = await options.client.createNote({ text, visibility });

  const generatedReason = fetch.tlMode === "no_tl" ? "no_tl" : fetch.tlMode === "vibe" ? "tl_vibe" : "tl_mention";
  await options.db.run(
    `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
     VALUES (@noteId, @postedAt, 'normal', @text, @visibility, @generatedReason, @createdAt)`,
    { noteId: note.id, postedAt: options.at, text, visibility, generatedReason, createdAt: options.at }
  );
  await options.db.run("UPDATE bot_state SET last_note_at = @at, updated_at = @at WHERE id = 1", { at: options.at });
  options.logger.info("scheduledPost.posted", { at: options.at, noteId: note.id, tlMode: fetch.tlMode, visibility });
}

// ─── メインエントリ ───────────────────────────────────────────────────

export async function runScheduledPostDraw(options: ScheduledPostDrawOptions): Promise<void> {
  await options.db.run("UPDATE bot_state SET updated_at = @at WHERE id = 1", { at: options.at });

  if (!options.enabled) {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: "disabled" });
    return;
  }

  const settings = await loadRuntimeSettings(options.db);
  const rand = options.random ?? Math.random;

  // ===== Phase 1: ガチャ =====
  const latestNormal = await options.db.get<{ posted_at: string }>(
    "SELECT posted_at FROM posts WHERE kind = 'normal' ORDER BY posted_at DESC LIMIT 1"
  );
  const draw = drawAction(settings, rand, latestNormal, options.at);

  if (draw.tag === "skip") {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: draw.reason, ...draw.meta });
    return;
  }

  const betaEnabled = readBooleanSetting(settings, "BETA_TEST1_ENABLED", false);
  if (betaEnabled) {
    options.logger.info("betaTest1.active", { at: options.at, quoteRnProb: 0.40, elapsedMult: 5.0 });
  }
  options.logger.info("scheduledPost.action", { at: options.at, action: draw.tag, tlMode: draw.tag === "normal" ? draw.tlMode : undefined });

  // ===== Phase 2: 取得 =====
  const fetch = await fetchData(draw, settings, options, rand);

  if (fetch.tag === "skip") {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: fetch.reason });
    return;
  }

  // ===== Phase 3: AI生成・投稿 =====
  await generateAndPost(fetch, settings, options);
}

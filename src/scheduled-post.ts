import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import type { RuntimeSettings } from "./runtime-settings.js";
import { generatePostText } from "./ai/generate-post.js";
import { generateTlPostText } from "./ai/generate-tl-post.js";
import { generateQuotePostText } from "./ai/generate-quote-post.js";
import {
  loadRuntimeSettings,
  readBooleanSetting,
  readIntegerSetting,
  readNumberSetting,
} from "./runtime-settings.js";
import { runTlScan } from "./tl-scan.js";
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
  generateText?: () => Promise<string | null>;
  generateTlText?: (summaries: string[]) => Promise<string | null>;
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
type DrawAction = { tag: "quote_rn" } | { tag: "tl_obs" } | { tag: "normal"; hint: NoteHint };
type DrawResult = DrawSkip | DrawAction;

function drawAction(
  settings: RuntimeSettings,
  rand: () => number,
  latestNormal: { posted_at: string } | undefined,
  at: string
): DrawResult {
  // TL 観測ガチャ
  if (rand() < readNumberSetting(settings, "TL_OBSERVATION_POST_PROBABILITY", 0.20)) {
    if (rand() < readNumberSetting(settings, "QUOTE_RENOTE_PROBABILITY", 0.20)) {
      return { tag: "quote_rn" };
    }
    return { tag: "tl_obs" };
  }

  // 通常ノート: 最短間隔 + 確率テーブル
  if (latestNormal) {
    const minInterval = readIntegerSetting(settings, "SCHEDULED_POST_MIN_INTERVAL_MINUTES", 5);
    const elapsedMs = new Date(at).getTime() - new Date(latestNormal.posted_at).getTime();
    const elapsedMinutes = elapsedMs / 60 / 1000;

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

  return { tag: "normal", hint: drawNoteHint(rand) };
}

// ─── Phase 2: 取得 ────────────────────────────────────────────────────

type FetchSkip = { tag: "skip"; reason: string };
type FetchQuoteRn = { tag: "quote_rn"; candidate: QuoteCandidate; summaries: string[] };
type FetchTlObs = { tag: "tl_obs"; summaries: string[] };
type FetchNormal = { tag: "normal"; hint: NoteHint };
type FetchResult = FetchSkip | FetchQuoteRn | FetchTlObs | FetchNormal;

async function fetchData(
  draw: DrawAction,
  settings: RuntimeSettings,
  options: ScheduledPostDrawOptions,
  rand: () => number
): Promise<FetchResult> {
  if (draw.tag === "normal") return { tag: "normal", hint: draw.hint };

  // TL スキャン（quote_rn / tl_obs 共通）
  const tlLimit = readIntegerSetting(settings, "TL_OBSERVATION_NOTE_COUNT", 20);
  const minSummaries = readIntegerSetting(settings, "TL_OBSERVATION_MIN_POSTS", 3);

  const { summaries } = await runTlScan({
    db: options.db,
    client: options.client,
    logger: options.logger,
    at: options.at,
    limit: tlLimit,
  });

  if (summaries.length < minSummaries) {
    return { tag: "skip", reason: "too_few_summaries" };
  }

  if (draw.tag === "tl_obs") return { tag: "tl_obs", summaries };

  // quote_rn: 引用候補を取得
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

  // 候補なし → summaries はあるので tl_obs テキストにフォールバック
  options.logger.info("quoteRenote.skip", { at: options.at, reason: "no_candidate_fallback_tl_obs" });
  return { tag: "tl_obs", summaries };
}

// ─── Phase 3: AI生成・投稿 ────────────────────────────────────────────

async function postTlObservation(
  summaries: string[],
  settings: RuntimeSettings,
  options: ScheduledPostDrawOptions
): Promise<void> {
  const tlGenerateFn =
    options.generateTlText ??
    ((s: string[]) =>
      generateTlPostText({
        settings,
        summaries: s,
        at: options.at,
        chutesApiKey: process.env.CHUTES_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        logger: options.logger,
      }));

  const tlText = await tlGenerateFn(summaries);
  if (!tlText) {
    options.logger.info("tlObservation.skip", { at: options.at, reason: "ai_failure" });
    return; // 通常ノートへは落ちない
  }

  const visibility = "public";
  const note = await options.client.createNote({ text: tlText, visibility });
  await options.db.run(
    `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
     VALUES (@noteId, @postedAt, 'tl_observation', @text, @visibility, 'tl_observation_v0', @createdAt)`,
    { noteId: note.id, postedAt: options.at, text: tlText, visibility, createdAt: options.at }
  );
  options.logger.info("tlObservation.posted", { at: options.at, noteId: note.id });
}

async function generateAndPost(
  fetch: FetchQuoteRn | FetchTlObs | FetchNormal,
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
         VALUES (@noteId, @postedAt, 'quote_renote', @text, @visibility, @sourceNoteId, 'quote_renote_v0', @createdAt)`,
        { noteId: note.id, postedAt: options.at, text: quoteText, visibility, sourceNoteId: fetch.candidate.noteId, createdAt: options.at }
      );
      options.logger.info("quoteRenote.posted", { at: options.at, noteId: note.id, sourceNoteId: fetch.candidate.noteId });
      return;
    }

    // AI 失敗 → TL 観測テキストにフォールバック（通常ノートへは落ちない）
    options.logger.info("quoteRenote.skip", { at: options.at, reason: "ai_failure_fallback_tl_obs" });
    await postTlObservation(fetch.summaries, settings, options);
    return;
  }

  // ── tl_obs ──
  if (fetch.tag === "tl_obs") {
    await postTlObservation(fetch.summaries, settings, options);
    return;
  }

  // ── normal ──
  const generateFn =
    options.generateText ??
    (() =>
      generatePostText({
        settings,
        db: options.db,
        at: options.at,
        chutesApiKey: process.env.CHUTES_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        logger: options.logger,
        hint: fetch.hint,
      }));

  const aiText = await generateFn();
  if (aiText === null && readBooleanSetting(settings, "AI_SKIP_POST_ON_AI_FAILURE", true)) {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: "ai_failure" });
    return;
  }

  const text = aiText ?? buildScheduledPostText(options.random);
  const visibility = "public";
  const note = await options.client.createNote({ text, visibility });
  await options.db.run(
    `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
     VALUES (@noteId, @postedAt, 'normal', @text, @visibility, 'scheduled_post_draw_v0', @createdAt)`,
    { noteId: note.id, postedAt: options.at, text, visibility, createdAt: options.at }
  );
  await options.db.run("UPDATE bot_state SET last_note_at = @at, updated_at = @at WHERE id = 1", { at: options.at });
  options.logger.info("scheduledPost.posted", { at: options.at, noteId: note.id, visibility });
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

  options.logger.info("scheduledPost.action", { at: options.at, action: draw.tag });

  // ===== Phase 2: 取得 =====
  const fetch = await fetchData(draw, settings, options, rand);

  if (fetch.tag === "skip") {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: fetch.reason });
    return;
  }

  // ===== Phase 3: AI生成・投稿 =====
  await generateAndPost(fetch, settings, options);
}

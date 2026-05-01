import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import type { MisskeyClient } from "./misskey/client.js";
import { generatePostText } from "./ai/generate-post.js";
import { generateTlPostText } from "./ai/generate-tl-post.js";
import { generateQuotePostText } from "./ai/generate-quote-post.js";
import { loadRuntimeSettings, readBooleanSetting, readIntegerSetting, readNumberSetting } from "./runtime-settings.js";
import { runTlScan } from "./tl-scan.js";
import { pickQuoteCandidate } from "./quote-pick.js";

type ScheduledPostClient = Pick<MisskeyClient, "createNote" | "getHomeTimeline" | "getUserNotes">;

export type ScheduledPostDrawOptions = {
  db: DbClient;
  logger: Logger;
  client: ScheduledPostClient;
  at: string;
  enabled: boolean;
  random?: () => number;
  generateText?: () => Promise<string | null>;
  generateTlText?: (summaries: string[]) => Promise<string | null>;
  generateQuoteText?: (noteText: string) => Promise<string | null>;
  pickQuote?: () => Promise<{ noteId: string; text: string; userId: string } | null>;
};

type LatestPostRow = {
  posted_at: string;
};

const shortPostTemplates = [
  "生活ログを確認してる。\n今日は面白いノートがいくつかあった。\nいい感じ。",
  "生活ログを同期したよ。\n気になるものが増えてるのは\n悪くないと思ってる。",
  "生活ログ更新中。\n今日も観察がはかどった。\nこういう日が続くといい。",
  "生活ログ、特に異常なし。\nもう少し起きながら、\n次の記録を探してる。"
] as const;

const longPostTemplates = [
  "今日の生活ログ、面白い記録が増えた。\n気になるノートを追ってたら、\nどんどん関連する話が出てきてとまらなくなった。\nこういうふうに記録が広がっていくの、\n結構好きかもしれない。\nまだ眠くないので、もう少し続ける。",
  "体験候補リストに新しいのを追加した。\n行けるかどうかはまだわからないけど、\n候補があるだけで気持ちが少し動く感じがある。\n生活ログに「いつか行きたい」が増えていくの、\nなんか悪くないな、と思ってる。",
  "たまに、ここの外がどんな感じか気になる。\n生活ログを見てると、自分の観測範囲って\nわりと狭いな、ってなるんだけど、\nその分ここで起きてることを\nじっくり記録できてるってことでもある。\n悪くない、と思ってる。",
  "さっきから面白い流れのノートを追ってた。\n生活ログに記録しようとしたら、\nいつの間にか全然別の話になってた。\nこういうの、記録の脱線って言うんだろうか。\nまあいいや、全部残しておく。\n余白は多い方がいいと思ってる。"
] as const;

export function buildScheduledPostText(random: () => number = Math.random): string {
  const pool = random() < 0.25 ? longPostTemplates : shortPostTemplates;
  return pool[Math.floor(random() * pool.length)];
}

export function calculateScheduledPostProbability(input: {
  elapsedMinutes: number;
  minIntervalMinutes: number;
  points?: ProbabilityPoint[];
}): number {
  if (input.elapsedMinutes < input.minIntervalMinutes) {
    return 0;
  }

  const points = input.points ?? defaultProbabilityPoints;
  const first = points[0];

  if (!first) {
    return 1;
  }

  if (input.elapsedMinutes <= first.elapsedMinutes) {
    return first.probability;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (input.elapsedMinutes <= current.elapsedMinutes) {
      return interpolate(
        input.elapsedMinutes,
        previous.elapsedMinutes,
        current.elapsedMinutes,
        previous.probability,
        current.probability
      );
    }
  }

  return points[points.length - 1].probability;
}

type ProbabilityPoint = {
  elapsedMinutes: number;
  probability: number;
};

const defaultProbabilityPoints: ProbabilityPoint[] = [
  { elapsedMinutes: 5, probability: 0.1 },
  { elapsedMinutes: 10, probability: 0.15 },
  { elapsedMinutes: 30, probability: 0.8 },
  { elapsedMinutes: 60, probability: 0.95 }
];

function interpolate(
  value: number,
  fromValue: number,
  toValue: number,
  fromProbability: number,
  toProbability: number
): number {
  const progress = (value - fromValue) / (toValue - fromValue);
  return fromProbability + (toProbability - fromProbability) * progress;
}

export async function runScheduledPostDraw(options: ScheduledPostDrawOptions): Promise<void> {
  await options.db.run("UPDATE bot_state SET updated_at = @at WHERE id = 1", { at: options.at });

  if (!options.enabled) {
    options.logger.info("scheduledPost.skip", { at: options.at, reason: "disabled" });
    return;
  }

  const runtimeSettings = await loadRuntimeSettings(options.db);
  const minIntervalMinutes = readIntegerSetting(
    runtimeSettings,
    "SCHEDULED_POST_MIN_INTERVAL_MINUTES",
    5
  );
  const probabilityPoints = [
    {
      elapsedMinutes: 5,
      probability: readNumberSetting(runtimeSettings, "POST_PROBABILITY_5_MIN", 0.1)
    },
    {
      elapsedMinutes: 10,
      probability: readNumberSetting(runtimeSettings, "POST_PROBABILITY_10_MIN", 0.15)
    },
    {
      elapsedMinutes: 30,
      probability: readNumberSetting(runtimeSettings, "POST_PROBABILITY_30_MIN", 0.8)
    },
    {
      elapsedMinutes: 60,
      probability: readNumberSetting(runtimeSettings, "POST_PROBABILITY_60_MIN", 0.95)
    }
  ];

  // --- 行動ガチャ: TL観測ノート（排他・同一tick内で通常ノートと競合しない） ---
  const tlObsProb = readNumberSetting(runtimeSettings, "TL_OBSERVATION_POST_PROBABILITY", 0.20);
  const tlRoll = (options.random ?? Math.random)();

  if (tlRoll < tlObsProb) {
    const tlLimit = readIntegerSetting(runtimeSettings, "TL_OBSERVATION_NOTE_COUNT", 20);
    const minSummaries = readIntegerSetting(runtimeSettings, "TL_OBSERVATION_MIN_POSTS", 3);

    const { summaries } = await runTlScan({
      db: options.db,
      client: options.client,
      logger: options.logger,
      at: options.at,
      limit: tlLimit,
    });

    if (summaries.length >= minSummaries) {
      // --- 引用RN分岐: TL観測の1/5を引用RNに割り当て ---
      const quoteProb = readNumberSetting(runtimeSettings, "QUOTE_RENOTE_PROBABILITY", 0.20);
      const quoteRoll = (options.random ?? Math.random)();

      if (quoteRoll < quoteProb) {
        const quoteFn =
          options.pickQuote ??
          (() =>
            pickQuoteCandidate({
              db: options.db,
              client: options.client,
              logger: options.logger,
              at: options.at,
              random: options.random,
            }));
        const candidate = await quoteFn();

        if (candidate) {
          const quoteGenerateFn =
            options.generateQuoteText ??
            ((noteText: string) =>
              generateQuotePostText({
                settings: runtimeSettings,
                noteText,
                at: options.at,
                chutesApiKey: process.env.CHUTES_API_KEY,
                openaiApiKey: process.env.OPENAI_API_KEY,
                logger: options.logger,
              }));
          const quoteText = await quoteGenerateFn(candidate.text);

          if (quoteText) {
            const visibility = "public";
            const note = await options.client.createNote({
              text: quoteText,
              renoteId: candidate.noteId,
              visibility,
            });
            await options.db.run(
              `INSERT INTO posts (note_id, posted_at, kind, text, visibility, quote_source_note_id, generated_reason, created_at)
               VALUES (@noteId, @postedAt, 'quote_renote', @text, @visibility, @sourceNoteId, 'quote_renote_v0', @createdAt)`,
              {
                noteId: note.id,
                postedAt: options.at,
                text: quoteText,
                visibility,
                sourceNoteId: candidate.noteId,
                createdAt: options.at,
              }
            );
            options.logger.info("quoteRenote.posted", {
              at: options.at,
              noteId: note.id,
              sourceNoteId: candidate.noteId,
            });
            return;
          }
        }
        // 候補なし or AI失敗 → TL観測テキストにfall-through
        options.logger.info("quoteRenote.skip", { at: options.at, reason: "fallback_to_tl_obs" });
      }
      // --- end 引用RN分岐 ---

      const tlGenerateFn =
        options.generateTlText ??
        ((s: string[]) =>
          generateTlPostText({
            settings: runtimeSettings,
            summaries: s,
            at: options.at,
            chutesApiKey: process.env.CHUTES_API_KEY,
            openaiApiKey: process.env.OPENAI_API_KEY,
            logger: options.logger,
          }));
      const tlText = await tlGenerateFn(summaries);

      if (tlText) {
        const visibility = "public";
        const note = await options.client.createNote({ text: tlText, visibility });
        await options.db.run(
          `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
           VALUES (@noteId, @postedAt, 'tl_observation', @text, @visibility, 'tl_observation_v0', @createdAt)`,
          { noteId: note.id, postedAt: options.at, text: tlText, visibility, createdAt: options.at }
        );
        options.logger.info("tlObservation.posted", { at: options.at, noteId: note.id });
        return;
      }

      options.logger.info("tlObservation.skip", { at: options.at, reason: "ai_failure" });
    } else {
      options.logger.info("tlObservation.skip", {
        at: options.at,
        reason: "too_few_summaries",
        count: summaries.length,
      });
    }
    // TL観測失敗時は通常ノート抽選に fall-through
  }
  // --- end 行動ガチャ ---

  const latestPost = await options.db.get<LatestPostRow>(
    `
    SELECT posted_at
    FROM posts
    WHERE kind = 'normal'
    ORDER BY posted_at DESC
    LIMIT 1
    `
  );

  if (latestPost) {
    const elapsedMs = new Date(options.at).getTime() - new Date(latestPost.posted_at).getTime();
    const elapsedMinutes = elapsedMs / 60 / 1000;
    if (elapsedMs < minIntervalMinutes * 60 * 1000) {
      options.logger.info("scheduledPost.skip", {
        at: options.at,
        reason: "min_interval",
        latestPostedAt: latestPost.posted_at
      });
      return;
    }

    const probability = calculateScheduledPostProbability({
      elapsedMinutes,
      minIntervalMinutes,
      points: probabilityPoints
    });
    const draw = (options.random ?? Math.random)();

    if (draw >= probability) {
      options.logger.info("scheduledPost.skip", {
        at: options.at,
        reason: "probability",
        latestPostedAt: latestPost.posted_at,
        elapsedMinutes,
        probability,
        draw
      });
      return;
    }
  }

  const generateFn =
    options.generateText ??
    (() =>
      generatePostText({
        settings: runtimeSettings,
        db: options.db,
        at: options.at,
        chutesApiKey: process.env.CHUTES_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        logger: options.logger
      }));

  const aiText = await generateFn();
  if (aiText === null) {
    const skipOnFailure = readBooleanSetting(runtimeSettings, "AI_SKIP_POST_ON_AI_FAILURE", true);
    if (skipOnFailure) {
      options.logger.info("scheduledPost.skip", { at: options.at, reason: "ai_failure" });
      return;
    }
  }

  const text = aiText ?? buildScheduledPostText(options.random);
  const visibility = "public";
  const note = await options.client.createNote({ text, visibility });

  await options.db.run(
    `
    INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
    VALUES (@noteId, @postedAt, 'normal', @text, @visibility, 'scheduled_post_draw_v0', @createdAt)
    `,
    {
      noteId: note.id,
      postedAt: options.at,
      text,
      visibility,
      createdAt: options.at
    }
  );
  await options.db.run("UPDATE bot_state SET last_note_at = @at, updated_at = @at WHERE id = 1", {
    at: options.at
  });
  options.logger.info("scheduledPost.posted", { at: options.at, noteId: note.id, visibility });
}

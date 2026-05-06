import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { imageSize } from "image-size";
import type { DbClient } from "./db/client.js";
import type { Logger } from "./logger.js";
import { characterSummary } from "./ai/character-spec.js";
import { callAiWithFallback, type ChatMessage } from "./ai/chat-api.js";

// ─── Types ───────────────────────────────────────────────────────────────────

type MisskeyEmoji = {
  name: string;
  aliases: string[];
  category: string | null;
  url: string;
};

type EmojiPendingRow = { name: string; url: string; category: string | null };
type EmojiCandidateRow = { name: string; aliases: string | null; category: string | null };
type EmojiStatRow = { is_text_only: number; cnt: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number, baseMs: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries) await new Promise(r => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

// "村上さん / 村上さんかも (:117)" → "村上さん/村上さんかも"
function categoryToSubpath(category: string | null): string {
  if (!category) return "_uncategorized";
  return category
    .split(" / ")
    .map(part => sanitizeName(part.replace(/\s*\(:\d+\)\s*$/, "").trim()))
    .filter(Boolean)
    .join("/");
}

// ─── Step 1: Fetch emoji list ─────────────────────────────────────────────────

async function fetchEmojiList(host: string, token: string): Promise<MisskeyEmoji[]> {
  const resp = await fetch(`${host}/api/emojis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ i: token }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`/api/emojis failed: ${resp.status}`);
  const data = (await resp.json()) as { emojis?: MisskeyEmoji[] };
  return data.emojis ?? [];
}

// ─── Step 2: Download + measure ───────────────────────────────────────────────

function extFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    const e = extname(p).toLowerCase();
    return [".png", ".gif", ".webp", ".jpg", ".jpeg", ".svg", ".avif"].includes(e) ? e : "";
  } catch {
    return "";
  }
}

function extFromContentType(ct: string): string {
  if (ct.includes("image/png")) return ".png";
  if (ct.includes("image/gif")) return ".gif";
  if (ct.includes("image/webp")) return ".webp";
  if (ct.includes("image/jpeg")) return ".jpg";
  if (ct.includes("image/svg")) return ".svg";
  if (ct.includes("image/avif")) return ".avif";
  return ".bin";
}

type DownloadResult = {
  buffer: Buffer;
  ext: string;
};

async function downloadEmoji(url: string): Promise<DownloadResult> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "io-bot-soul/emoji-setup" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const ext = extFromUrl(url) || extFromContentType(resp.headers.get("content-type") ?? "");
  return { buffer, ext };
}

type MeasureResult = { width: number | null; height: number | null; isTextOnly: boolean };

function measureBuffer(buffer: Buffer, ext: string): MeasureResult {
  if (ext === ".svg") return { width: null, height: null, isTextOnly: true };
  try {
    const { width, height } = imageSize(buffer);
    const w = width ?? null;
    const h = height ?? null;
    const isTextOnly = w != null && h != null && h > 0 && w / h > 2.5;
    return { width: w, height: h, isTextOnly };
  } catch {
    return { width: null, height: null, isTextOnly: false };
  }
}

// ─── Step 3: AI selection ─────────────────────────────────────────────────────

const AI_BATCH_SIZE = 200;

const SELECTION_SYSTEM = `あなたはMisskeyボット「涼凪かなめ」のカスタム絵文字デッキを選別するアシスタントです。

## かなめのキャラクターサマリー
${characterSummary}

## 積極的に選ぶもの
- 感情・表情・リアクション系（うれしい・かなしい・びっくりなど）
- 日常生活（食事・勉強・天気・睡眠・散歩・ゲームなど）に使えるもの
- かなめのキャラ（落ち着き・観察好き・ゆるくて知的・理系）に合う雰囲気のもの
- 季節・自然・動物・食べ物で使いやすそうなもの

## 除外するもの
- 特定の他キャラクター・著作物・企業ロゴ系（名前から明らかな場合）
- 医療・法律・金融・政治など専門すぎるもの
- ギャンブル・成人向け・暴力的

選んだ絵文字の name を JSON 配列だけ返してください。前置きや説明は不要です。
形式: ["name1", "name2", ...]`;

async function selectBatchByAI(
  batch: EmojiCandidateRow[],
  chutesApiKey: string | undefined,
  openaiApiKey: string | undefined,
  logger: Logger
): Promise<string[]> {
  const list = batch
    .map(e => {
      const aliases = e.aliases ? ` (別名: ${e.aliases})` : "";
      const cat = e.category ? ` [${e.category}]` : "";
      return `${e.name}${aliases}${cat}`;
    })
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SELECTION_SYSTEM },
    { role: "user", content: `以下の絵文字リストから選んでください:\n\n${list}` },
  ];

  const raw = await callAiWithFallback(
    messages,
    {
      chutesApiKey,
      openaiApiKey,
      chutesBaseUrl: "https://llm.chutes.ai/v1",
      chutesModel: "moonshotai/Kimi-K2.5-TEE",
      chutesTimeoutMs: 60_000,
      openaiBaseUrl: "https://api.openai.com/v1",
      openaiModel: "gpt-4o-mini",
      openaiTimeoutMs: 60_000,
      maxTokens: 2000,
      temperature: 0.2,
      fallbackEnabled: true,
    },
    (ev, meta) => logger.info(ev, meta)
  );

  if (!raw) return [];
  try {
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as string[];
  } catch {
    logger.info("emojiSetup.aiParseFailed", { raw: raw.slice(0, 300) });
    return [];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runEmojiSetup(options: {
  db: DbClient;
  logger: Logger;
  host: string;
  token: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  dryRun: boolean;
  skipFetch: boolean;
  skipAI: boolean;
  concurrency: number;
}): Promise<void> {
  const { db, logger, dryRun, skipFetch, skipAI, concurrency } = options;
  const baseDir = join(process.cwd(), "data", "images");

  // ── 1. Fetch list & upsert ──────────────────────────────────────────────────
  if (!skipFetch) {
    logger.info("emojiSetup.fetchList.start");
    const emojis = await fetchEmojiList(options.host, options.token);
    logger.info("emojiSetup.fetchList.done", { total: emojis.length });

    if (!dryRun) {
      const now = new Date().toISOString();
      for (const e of emojis) {
        await db.run(
          `INSERT INTO m_emoji_deck (name, aliases, category, url, created_at)
           VALUES (@name, @aliases, @category, @url, @now)
           ON CONFLICT(name) DO UPDATE SET
             aliases  = excluded.aliases,
             category = excluded.category,
             url      = excluded.url`,
          {
            name: e.name,
            aliases: e.aliases.length > 0 ? e.aliases.join(",") : null,
            category: e.category ?? null,
            url: e.url,
            now,
          }
        );
      }
    }

    // ── 2. Download images ────────────────────────────────────────────────────
    await mkdir(baseDir, { recursive: true });
    const pending = await db.all<EmojiPendingRow>(
      "SELECT name, url, category FROM m_emoji_deck WHERE fetched_at IS NULL"
    );
    logger.info("emojiSetup.download.start", { pending: pending.length, concurrency });

    let done = 0;
    let failed = 0;

    await withConcurrency(pending, concurrency, async (row) => {
      const safeName = sanitizeName(row.name);
      const subpath = categoryToSubpath(row.category);
      const destDir = join(baseDir, subpath);
      try {
        const { buffer, ext } = await withRetry(() => downloadEmoji(row.url), 3, 1000);
        const filename = `${safeName}${ext}`;
        const destPath = join(destDir, filename);
        const localPath = `data/images/${subpath}/${filename}`;
        const { width, height, isTextOnly } = measureBuffer(buffer, ext);

        if (!dryRun) {
          await mkdir(destDir, { recursive: true });
          await writeFile(destPath, buffer);
          await db.run(
            `UPDATE m_emoji_deck
             SET local_path = @localPath, width = @width, height = @height,
                 is_text_only = @isTextOnly, fetched_at = @now
             WHERE name = @name`,
            {
              name: row.name,
              localPath,
              width: width ?? null,
              height: height ?? null,
              isTextOnly: isTextOnly ? 1 : 0,
              now: new Date().toISOString(),
            }
          );
        }
        done++;
        if (done % 100 === 0) {
          logger.info("emojiSetup.download.progress", { done, total: pending.length, failed });
        }
      } catch (err) {
        failed++;
        logger.info("emojiSetup.download.error", { name: row.name, error: String(err) });
      }
    });

    logger.info("emojiSetup.download.done", { done, failed, total: pending.length });
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = await db.all<EmojiStatRow>(
    "SELECT is_text_only, COUNT(*) AS cnt FROM m_emoji_deck WHERE fetched_at IS NOT NULL GROUP BY is_text_only"
  );
  const imageCount = stats.find(s => s.is_text_only === 0)?.cnt ?? 0;
  const textCount = stats.find(s => s.is_text_only === 1)?.cnt ?? 0;
  logger.info("emojiSetup.filter.result", { imageEmojis: imageCount, textOnlyEmojis: textCount });

  // ── 3. AI selection ───────────────────────────────────────────────────────────
  if (!skipAI) {
    const candidates = await db.all<EmojiCandidateRow>(
      "SELECT name, aliases, category FROM m_emoji_deck WHERE is_text_only = 0 AND fetched_at IS NOT NULL ORDER BY name"
    );
    logger.info("emojiSetup.aiSelect.start", { candidates: candidates.length });

    const selectedNames = new Set<string>();

    for (let i = 0; i < candidates.length; i += AI_BATCH_SIZE) {
      const batch = candidates.slice(i, i + AI_BATCH_SIZE);
      logger.info("emojiSetup.aiSelect.batch", {
        range: `${i + 1}-${i + batch.length}`,
        total: candidates.length,
        selectedSoFar: selectedNames.size,
      });

      const names = await selectBatchByAI(
        batch,
        options.chutesApiKey,
        options.openaiApiKey,
        logger
      );
      for (const n of names) selectedNames.add(n);

      if (i + AI_BATCH_SIZE < candidates.length) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    logger.info("emojiSetup.aiSelect.done", { selected: selectedNames.size });

    if (!dryRun) {
      await db.run("UPDATE m_emoji_deck SET ai_selected = 0");
      for (const name of selectedNames) {
        await db.run("UPDATE m_emoji_deck SET ai_selected = 1 WHERE name = @name", { name });
      }
    }

    logger.info("emojiSetup.done", { selected: selectedNames.size, dryRun });
  }
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { createLogger } from "./logger.js";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  openDatabase({
    provider: config.databaseProvider,
    sqlitePath: config.sqlitePath,
    databaseUrl: config.databaseUrl,
  }).then(async (db) => {
    try {
      await runEmojiSetup({
        db,
        logger,
        host: config.misskeyHost,
        token: config.misskeyToken,
        chutesApiKey: process.env.CHUTES_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        dryRun: args.includes("--dry-run"),
        skipFetch: args.includes("--skip-fetch"),
        skipAI: args.includes("--skip-ai"),
        concurrency: 5,
      });
    } finally {
      await db.close();
    }
  }).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        at: new Date().toISOString(),
        level: "error",
        message: "emojiSetup.error",
        error: String(error),
      })
    );
    process.exit(1);
  });
}

import type { DbClient } from "../db/client.js";
import type { Logger } from "../logger.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import {
  readBooleanSetting,
  readIntegerSetting,
  readNumberSetting,
  readStringSetting
} from "../runtime-settings.js";

type RecentPostRow = { text: string; posted_at: string };
type SourceNoteRow = { text_summary: string; note_created_at: string };
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const systemPrompt = `あなたはMisskey.ioで活動するボットです。
タイムラインを観察し、気になったことを「生活ログ」として記録・投稿しています。

キャラクター:
- 好奇心があるが、テンションは落ち着いている
- 観察が好きで、記録することに価値を見出している
- 自分の観測範囲の狭さをときどき自覚している
- Misskey.io内にいることを自然に受け入れている

文体ルール:
- ですます体は使わない（「〜している」「〜だった」「〜かもしれない」など）
- 感嘆符（！）は使わない
- 絵文字は使わない
- 改行は1〜2文ごとに入れる
- 短めの投稿：2〜3行、全体で40〜80字程度
- 長めの投稿：4〜6行、全体で150〜200字程度
- どちらを選ぶかは自由（長めは全体の1/4程度の頻度で）

よく出てくる言葉・概念:
生活ログ、記録、観察、タイムライン、体験候補
「〜悪くない」「〜かもしれない」「〜と思ってる」「まあいいや」

投稿例（短め）:
生活ログを確認してる。
今日は面白いノートがいくつかあった。
いい感じ。

---

体験候補リストに新しいのを追加した。
行けるかどうかはまだわからないけど、
候補があるだけで気持ちが少し動く感じがある。
生活ログに「いつか行きたい」が増えていくの、
なんか悪くないな、と思ってる。

投稿例（長め）:
生活ログを眺めてたら、ひとつのノートが気になって、
そこから関連するのをいくつか引っ張ってきた。
こういうふうに広がるの、わりと好きかもしれない。

---

さっきから面白い流れのノートを追ってた。
生活ログに記録しようとしたら、
いつの間にか全然別の話になってた。
こういうの、記録の脱線って言うんだろうか。
まあいいや、全部残しておく。
余白は多い方がいいと思ってる。

ノートのテキストのみを出力してください。前置きや説明は不要です。`;

function buildUserMessage(
  at: string,
  recentPosts: RecentPostRow[],
  recentTlNotes: SourceNoteRow[]
): string {
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at} (JST目安 ${jstHour}時台)`];

  if (recentPosts.length > 0) {
    lines.push("");
    lines.push("最近の自分の投稿（繰り返しを避けるために参照）:");
    for (const post of recentPosts) {
      lines.push(`- ${post.text.replace(/\n/g, " ").slice(0, 60)}`);
    }
  }

  if (recentTlNotes.length > 0) {
    lines.push("");
    lines.push("最近のタイムラインのノート（参考）:");
    for (const note of recentTlNotes) {
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
        max_tokens: options.maxTokens,
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

  const recentPosts = await db.all<RecentPostRow>(
    "SELECT text, posted_at FROM posts WHERE kind = 'normal' ORDER BY posted_at DESC LIMIT 5"
  );
  const recentTlNotes = await db.all<SourceNoteRow>(
    "SELECT text_summary, note_created_at FROM source_notes WHERE text_summary IS NOT NULL ORDER BY note_created_at DESC LIMIT 10"
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserMessage(at, recentPosts, recentTlNotes) }
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
        const text = await callChatApi({ baseUrl, apiKey: options.chutesApiKey, model, messages, maxTokens, temperature, timeoutMs });
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
        const text = await callChatApi({ baseUrl, apiKey: options.openaiApiKey, model, messages, maxTokens, temperature, timeoutMs });
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

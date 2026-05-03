import { buildCharacterSystemPrompt } from "./character-spec.js";
import { callAiWithFallback } from "./chat-api.js";
import type { ChatMessage } from "./chat-api.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import type { Logger } from "../logger.js";
import {
  readStringSetting,
  readIntegerSetting,
  readBooleanSetting,
} from "../runtime-settings.js";

function jstHourFromIso(iso: string): number {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getHours();
}

function buildAiOptions(
  settings: RuntimeSettings,
  chutesApiKey: string | undefined,
  openaiApiKey: string | undefined
) {
  return {
    chutesApiKey,
    openaiApiKey,
    chutesBaseUrl: readStringSetting(settings, "CHUTES_BASE_URL", "https://llm.chutes.ai/v1"),
    chutesModel: readStringSetting(settings, "CHUTES_MODEL_TEXT", "moonshotai/Kimi-K2.5-TEE"),
    chutesTimeoutMs: readIntegerSetting(settings, "CHUTES_TIMEOUT_MS", 30000),
    openaiBaseUrl: readStringSetting(settings, "OPENAI_BASE_URL", "https://api.openai.com/v1"),
    openaiModel: readStringSetting(settings, "OPENAI_MODEL_TEXT", "gpt-5.4-mini"),
    openaiTimeoutMs: readIntegerSetting(settings, "OPENAI_TIMEOUT_MS", 30000),
    maxTokens: 300,
    temperature: 0.9,
    fallbackEnabled:
      readBooleanSetting(settings, "AI_FALLBACK_ENABLED", true) &&
      readStringSetting(settings, "AI_FALLBACK_PROVIDER", "openai") === "openai",
  };
}

export async function generateOyasumiPost(options: {
  settings: RuntimeSettings;
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<string | null> {
  const hour = jstHourFromIso(options.at);
  const systemPrompt = buildCharacterSystemPrompt([
    "今回は「おやすみ」ノートを書きます。",
    "簡潔に、かなめらしさを出してください。",
  ]);

  const userMessage = `現在時刻: ${options.at}（JST目安 ${hour}時台）

かなめとして、就寝するノートを1つ書いてください。

制約:
- 必ず「おやすみ」という言葉をテキスト内に含めること
- 1〜3行（50字以内を目安）
- 寝ることが伝わる内容であれば他は自由
- 文体・話題・締め方は自由（毎回変えること）
- 例: 「今日も観測がはかどった。おやすみ。」のような感じでよい`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  return callAiWithFallback(
    messages,
    buildAiOptions(options.settings, options.chutesApiKey, options.openaiApiKey),
    (event, meta) => options.logger.info(event, meta)
  );
}

export async function generateOhayouPost(options: {
  settings: RuntimeSettings;
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<string | null> {
  const hour = jstHourFromIso(options.at);
  const systemPrompt = buildCharacterSystemPrompt([
    "今回は「おはよう」ノートを書きます。",
    "簡潔に、かなめらしさを出してください。",
  ]);

  const userMessage = `現在時刻: ${options.at}（JST目安 ${hour}時台）

かなめとして、起床したノートを1つ書いてください。

制約:
- 必ず「おはよう」という言葉をテキスト内に含めること
- 1〜3行（50字以内を目安）
- 起きたことが伝わる内容であれば他は自由
- 体調・気分・今日の予定・前日の余韻など何でもよい`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  return callAiWithFallback(
    messages,
    buildAiOptions(options.settings, options.chutesApiKey, options.openaiApiKey),
    (event, meta) => options.logger.info(event, meta)
  );
}

export async function generateMurmurPost(options: {
  settings: RuntimeSettings;
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<string | null> {
  const hour = jstHourFromIso(options.at);
  const systemPrompt = buildCharacterSystemPrompt([
    "今回は睡眠中の「寝言」ノートを書きます。",
    "夢の断片や意味のないつぶやきを、かなめらしく表現してください。",
  ]);

  const userMessage = `現在時刻: ${options.at}（JST目安 ${hour}時台）

かなめが睡眠中につぶやく「寝言」ノートを1つ書いてください。

制約:
- 「おやすみ」「おはよう」は使わない
- 夢の断片、意味のないつぶやき、文脈が繋がらない内容
- 1〜2行、短め（40字以内を目安）
- 後から読んで「なんで言ったんだろう」と思えるもの`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  return callAiWithFallback(
    messages,
    buildAiOptions(options.settings, options.chutesApiKey, options.openaiApiKey),
    (event, meta) => options.logger.info(event, meta)
  );
}

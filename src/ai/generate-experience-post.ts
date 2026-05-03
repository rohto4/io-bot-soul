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

export async function generateExperiencePost(options: {
  settings: RuntimeSettings;
  candidateSummary: string;
  sourceUsername: string | null;
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<string | null> {
  const systemPrompt = buildCharacterSystemPrompt([
    "今回は、他の人のノートに触発されて自分が体験したこととして投稿します。",
    "相手のノートの内容をそのまま引用しないで、自分の言葉で『こういうことをした』と書いてください。",
    "相手の名前を出す場合は、短文でフォロワーへの言及程度にとどめてください。"
  ]);

  const userNamePart = options.sourceUsername
    ? `${options.sourceUsername} さんのノートを見て、`
    : "タイムラインを眺めていて、";

  const userMessage = `${userNamePart}気になったので同じような体験をしてみたことにします。

元の雰囲気:
「${options.candidateSummary.slice(0, 120)}」

制約:
- 1〜3行（60字以内を目安）
- 「〜〜した」「〜〜してきた」という体験の語尾を含める
- 相手のノート本文を丸写ししない
- 自分の言葉で抽象化した感想・気づきを書く
- 明るく、軽い、かなめらしいトーン`;

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

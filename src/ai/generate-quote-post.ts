import type { Logger } from "../logger.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import {
  readBooleanSetting,
  readIntegerSetting,
  readNumberSetting,
  readStringSetting,
} from "../runtime-settings.js";
import { buildCharacterSystemPrompt } from "./character-spec.js";
import { callAiWithFallback } from "./chat-api.js";
import type { ChatMessage } from "./chat-api.js";

const systemPrompt = buildCharacterSystemPrompt([
  "## 引用ノートのルール",
  "- 引用元のノートへの短い反応・感想を1〜2文でノートする",
  "- 引用元のユーザーを名指ししない",
  "- 引用元の本文をそのまま繰り返さない",
  "- かなめが「これは体験に取り込みたい」「気になった」と感じた理由を素直に表現する",
]);

function buildUserMessage(at: string, noteText: string): string {
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  return [
    `現在時刻: ${at}（JST目安 ${jstHour}時台）`,
    "",
    "## 引用するノート",
    `「${noteText.slice(0, 120)}」`,
    "",
    "このノートを引用しながら、短い感想をノートしてください（1〜2文）。",
  ].join("\n");
}

export async function generateQuotePostText(options: {
  settings: RuntimeSettings;
  noteText: string;
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<string | null> {
  const { settings, noteText, at, logger } = options;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserMessage(at, noteText) },
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
      maxTokens: 200,
      temperature: readNumberSetting(settings, "AI_TEMPERATURE_TEXT", 0.8),
      fallbackEnabled:
        readBooleanSetting(settings, "AI_FALLBACK_ENABLED", true) &&
        readStringSetting(settings, "AI_FALLBACK_PROVIDER", "openai") === "openai",
    },
    (event, meta) => logger.info(event, meta)
  );
}

import type { Logger } from "../logger.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import {
  readBooleanSetting,
  readIntegerSetting,
  readStringSetting,
} from "../runtime-settings.js";
import { callAiWithFallback } from "./chat-api.js";
import type { ChatMessage } from "./chat-api.js";

const systemPrompt = [
  "あなたはテキストの安全性を判定するアシスタントです。",
  "Misskeyのノートを「かなめのキャラクターの日常のヒント」として採用してよいかを判定します。",
  "引用や転載は一切しません。雰囲気や体験のヒントとして参考にするだけです。",
  "",
  "OK: 日常・趣味・食事・ゲーム・感情の軽い表現・季節・天気・技術・学習・ミーム",
  "NG: 個人特定情報・深刻な病気/事故/死・激しい怒り/炎上/攻撃・政治・成人向け",
  "",
  "「OK」または「NG」の1単語のみで回答してください。",
].join("\n");

export async function classifyExperienceCandidate(options: {
  settings: RuntimeSettings;
  text: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<boolean> {
  const { settings, text, logger } = options;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `以下のテキストを判定してください:\n「${text.slice(0, 200)}」` },
  ];

  const result = await callAiWithFallback(
    messages,
    {
      chutesApiKey: options.chutesApiKey,
      openaiApiKey: options.openaiApiKey,
      chutesBaseUrl: readStringSetting(settings, "CHUTES_BASE_URL", "https://llm.chutes.ai/v1"),
      chutesModel: readStringSetting(settings, "CHUTES_MODEL_CLASSIFIER", "moonshotai/Kimi-K2.5-TEE"),
      chutesTimeoutMs: readIntegerSetting(settings, "CHUTES_TIMEOUT_MS", 30000),
      openaiBaseUrl: readStringSetting(settings, "OPENAI_BASE_URL", "https://api.openai.com/v1"),
      openaiModel: readStringSetting(settings, "OPENAI_MODEL_CLASSIFIER", "gpt-4o-mini"),
      openaiTimeoutMs: readIntegerSetting(settings, "OPENAI_TIMEOUT_MS", 30000),
      maxTokens: 5,
      temperature: 0.0,
      fallbackEnabled:
        readBooleanSetting(settings, "AI_FALLBACK_ENABLED", true) &&
        readStringSetting(settings, "AI_FALLBACK_PROVIDER", "openai") === "openai",
    },
    (event, meta) => logger.info(event, meta)
  );

  if (!result) {
    // 判定失敗時は安全側に倒してNG扱い
    logger.warn("experienceCandidate.classifyFailed", { text: text.slice(0, 50) });
    return false;
  }

  const safe = result.trim().toUpperCase().startsWith("OK");
  logger.info("experienceCandidate.classified", { safe, text: text.slice(0, 50) });
  return safe;
}

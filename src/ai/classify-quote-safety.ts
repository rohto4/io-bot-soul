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
  "あなたはコンテンツ安全審査AIです。",
  "与えられたノートを第三者が引用RNする場合に問題がないか判断します。",
  "",
  "NGと判断する条件:",
  "- 医療・治療・症状・薬に関する具体的な記述",
  "- 政治・選挙・政党・政治家への言及",
  "- 投資・株・FX・仮想通貨の具体的な話題",
  "- 法律・訴訟・犯罪・事件の具体的な記述",
  "- 宗教・思想・信条の押しつけ",
  "- 個人情報・住所・電話番号・氏名",
  "- 他者への攻撃・誹謗中傷・差別的表現",
  "- 性的・暴力的・不適切な表現",
  "- 本人が傷ついていることが明確な重い感情的内容",
  "- 揉め事・トラブル・炎上に関与している内容",
  "",
  "「OK」または「NG」のみで答えてください。",
].join("\n");

export async function classifyQuoteSafety(options: {
  settings: RuntimeSettings;
  text: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<boolean> {
  const { settings, text, logger } = options;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `ノート:\n「${text.slice(0, 200)}」` },
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
    logger.warn("quoteSafety.classifyFailed", { text: text.slice(0, 50) });
    return false;
  }

  const safe = result.trim().toUpperCase().startsWith("OK");
  logger.info("quoteSafety.classified", { safe, text: text.slice(0, 50) });
  return safe;
}

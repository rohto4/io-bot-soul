import type { Logger } from "../logger.js";
import type { RuntimeSettings } from "../runtime-settings.js";
import {
  readBooleanSetting,
  readIntegerSetting,
  readStringSetting,
} from "../runtime-settings.js";
import { callAiWithFallback } from "./chat-api.js";
import type { ChatMessage } from "./chat-api.js";

const SYSTEM_PROMPT = [
  "あなたはテキストリストの安全性を判定するアシスタントです。",
  "Misskeyのノートを「かなめのキャラクターの日常のヒント」として採用してよいかを判定します。",
  "引用や転載は一切しません。雰囲気や体験のヒントとして参考にするだけです。",
  "",
  "OK: 日常・趣味・食事・ゲーム・感情の軽い表現・季節・天気・技術・学習・ミーム",
  "NG: 個人特定情報・深刻な病気/事故/死・激しい怒り/炎上/攻撃・政治・成人向け",
  "",
  "各テキストをOK/NGで判定し、入力と同じ順番でJSON配列だけ返してください。",
  '例: ["OK","NG","OK"]',
].join("\n");

function buildAiOptions(settings: RuntimeSettings, apiKeys: { chutes: string | undefined; openai: string | undefined }) {
  return {
    chutesApiKey: apiKeys.chutes,
    openaiApiKey: apiKeys.openai,
    chutesBaseUrl: readStringSetting(settings, "CHUTES_BASE_URL", "https://llm.chutes.ai/v1"),
    chutesModel: readStringSetting(settings, "CHUTES_MODEL_CLASSIFIER", "moonshotai/Kimi-K2.5-TEE"),
    chutesTimeoutMs: readIntegerSetting(settings, "CHUTES_TIMEOUT_MS", 30000),
    openaiBaseUrl: readStringSetting(settings, "OPENAI_BASE_URL", "https://api.openai.com/v1"),
    openaiModel: readStringSetting(settings, "OPENAI_MODEL_CLASSIFIER", "gpt-4o-mini"),
    openaiTimeoutMs: readIntegerSetting(settings, "OPENAI_TIMEOUT_MS", 30000),
    maxTokens: readIntegerSetting(settings, "AI_CLASSIFIER_MAX_TOKENS", 300),
    temperature: 0.0,
    fallbackEnabled:
      readBooleanSetting(settings, "AI_FALLBACK_ENABLED", true) &&
      readStringSetting(settings, "AI_FALLBACK_PROVIDER", "openai") === "openai",
  };
}

export async function classifyExperienceCandidateBatch(options: {
  settings: RuntimeSettings;
  texts: string[];
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<boolean[]> {
  const { settings, texts, logger } = options;
  if (texts.length === 0) return [];

  const list = texts
    .map((t, i) => `${i + 1}: 「${t.slice(0, 200)}」`)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `以下のテキストリストを判定してください:\n${list}` },
  ];

  const result = await callAiWithFallback(
    messages,
    buildAiOptions(settings, { chutes: options.chutesApiKey, openai: options.openaiApiKey }),
    (event, meta) => logger.info(event, meta)
  );

  if (!result) {
    logger.warn("experienceCandidate.batchClassifyFailed", { count: texts.length });
    return texts.map(() => false);
  }

  try {
    const match = result.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error("no array found");
    const arr = JSON.parse(match[0]) as string[];
    const results = arr.map(v => v.trim().toUpperCase().startsWith("OK"));
    while (results.length < texts.length) results.push(false);
    return results.slice(0, texts.length);
  } catch {
    logger.warn("experienceCandidate.batchClassifyParseFailed", { result: result.slice(0, 200) });
    return texts.map(() => false);
  }
}

// 後方互換: 単体判定（既存テストなどから利用）
export async function classifyExperienceCandidate(options: {
  settings: RuntimeSettings;
  text: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<boolean> {
  const results = await classifyExperienceCandidateBatch({
    settings: options.settings,
    texts: [options.text],
    chutesApiKey: options.chutesApiKey,
    openaiApiKey: options.openaiApiKey,
    logger: options.logger,
  });
  return results[0] ?? false;
}

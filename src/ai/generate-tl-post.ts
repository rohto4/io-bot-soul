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
  "## タイムライン観察ノートのルール",
  "- 今のタイムラインの流れから感じたこと・気になったことをノートする",
  "- 特定のユーザー・投稿を名指ししない。「誰かが〜していた」「〜という言葉が流れてきた」程度の抽象度にする",
  "- 他者の投稿本文をそのまま引用・コピーしない",
  "- あくまで「かなめ自身がタイムラインを眺めて感じたこと・考えたこと」として書く",
  "- 多様性ルール：直前の投稿と同じ書き出し・締め方を使わない",
]);

function buildUserMessage(at: string, summaries: string[]): string {
  const jstHour = (new Date(at).getUTCHours() + 9) % 24;
  const lines: string[] = [`現在時刻: ${at}（JST目安 ${jstHour}時台）`];

  lines.push("");
  lines.push("## 今のタイムラインの流れ");
  lines.push(
    "あなたが今眺めているタイムラインには、こんな投稿が流れています（個人は特定しないこと）："
  );
  for (const s of summaries) {
    lines.push(`- ${s}`);
  }

  lines.push("");
  lines.push(
    "このタイムラインを眺めながら、何か感じたこと・気になったことをノートしてください。"
  );
  return lines.join("\n");
}

export async function generateTlPostText(options: {
  settings: RuntimeSettings;
  summaries: string[];
  at: string;
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  logger: Logger;
}): Promise<string | null> {
  const { settings, summaries, at, logger } = options;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserMessage(at, summaries) },
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
      maxTokens: readIntegerSetting(settings, "AI_POST_GENERATION_MAX_TOKENS", 600),
      temperature: readNumberSetting(settings, "AI_TEMPERATURE_TEXT", 0.8),
      fallbackEnabled:
        readBooleanSetting(settings, "AI_FALLBACK_ENABLED", true) &&
        readStringSetting(settings, "AI_FALLBACK_PROVIDER", "openai") === "openai",
    },
    (event, meta) => logger.info(event, meta)
  );
}

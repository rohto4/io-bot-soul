export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callChatApi(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  maxTokensField: "max_tokens" | "max_completion_tokens";
}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        [options.maxTokensField]: options.maxTokens,
        temperature: options.temperature,
      }),
      signal: controller.signal,
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

export type AiProviderOptions = {
  chutesApiKey: string | undefined;
  openaiApiKey: string | undefined;
  chutesBaseUrl: string;
  chutesModel: string;
  chutesTimeoutMs: number;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiTimeoutMs: number;
  maxTokens: number;
  temperature: number;
  fallbackEnabled: boolean;
};

export async function callAiWithFallback(
  messages: ChatMessage[],
  opts: AiProviderOptions,
  onLog: (event: string, meta: Record<string, unknown>) => void
): Promise<string | null> {
  if (opts.chutesApiKey) {
    try {
      const text = await callChatApi({
        baseUrl: opts.chutesBaseUrl,
        apiKey: opts.chutesApiKey,
        model: opts.chutesModel,
        messages,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.chutesTimeoutMs,
        maxTokensField: "max_tokens",
      });
      if (text) {
        onLog("ai.done", { provider: "chutes", model: opts.chutesModel });
        return text;
      }
    } catch (error: unknown) {
      onLog("ai.error", { provider: "chutes", error: String(error) });
    }
  } else {
    onLog("ai.skip", { provider: "chutes", reason: "no_api_key" });
  }

  if (!opts.fallbackEnabled) return null;

  if (opts.openaiApiKey) {
    try {
      const text = await callChatApi({
        baseUrl: opts.openaiBaseUrl,
        apiKey: opts.openaiApiKey,
        model: opts.openaiModel,
        messages,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.openaiTimeoutMs,
        maxTokensField: "max_completion_tokens",
      });
      if (text) {
        onLog("ai.done", { provider: "openai", model: opts.openaiModel });
        return text;
      }
    } catch (error: unknown) {
      onLog("ai.error", { provider: "openai", error: String(error) });
    }
  } else {
    onLog("ai.skip", { provider: "openai", reason: "no_api_key" });
  }

  return null;
}

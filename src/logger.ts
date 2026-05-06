export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function formatJstTimestamp(value: string): string {
  if (!isoTimestampPattern.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}T${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}:${pad2(jst.getUTCSeconds())}.${pad3(jst.getUTCMilliseconds())}+09:00`;
}

function isTimestampField(key: string): boolean {
  return key === "at" || key.endsWith("At") || key.endsWith("Until");
}

function formatLogMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      isTimestampField(key) && typeof value === "string" ? formatJstTimestamp(value) : value
    ])
  );
}

export function createLogger(minLevel: LogLevel): Logger {
  function write(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    if (levelOrder[level] < levelOrder[minLevel]) {
      return;
    }

    const entry = {
      at: formatJstTimestamp(new Date().toISOString()),
      level,
      message,
      ...formatLogMeta(meta)
    };
    const line = JSON.stringify(entry);

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}

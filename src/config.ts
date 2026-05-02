import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const envSchema = z.object({
  MISSKEY_HOST: z.string().url().default("https://misskey.io"),
  MISSKEY_TOKEN: z.string().min(1, "MISSKEY_TOKEN is required"),
  PINNED_CONSENT_NOTE_ID: z.string().optional().default(""),
  ADMIN_ACCOUNT: z.string().min(1).default("@unibell4"),
  DATABASE_PROVIDER: z.enum(["sqlite", "postgres"]).default("sqlite"),
  DATABASE_URL: z.string().optional().default(""),
  SQLITE_PATH: z.string().min(1).default("./data/bot.sqlite"),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(60),
  POST_DRAW_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(300),
  EXPERIENCE_SCAN_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(600),
  SCHEDULED_POSTING_ENABLED: z
    .string()
    .transform((value) => value.toLowerCase() === "true")
    .default("false"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type BotConfig = {
  misskeyHost: string;
  misskeyToken: string;
  pinnedConsentNoteId: string;
  adminAccount: string;
  databaseProvider: "sqlite" | "postgres";
  databaseUrl: string;
  sqlitePath: string;
  pollIntervalMs: number;
  postDrawIntervalMs: number;
  experienceScanIntervalMs: number;
  scheduledPostingEnabled: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = envSchema.parse(env);

  return {
    misskeyHost: parsed.MISSKEY_HOST,
    misskeyToken: parsed.MISSKEY_TOKEN,
    pinnedConsentNoteId: parsed.PINNED_CONSENT_NOTE_ID,
    adminAccount: parsed.ADMIN_ACCOUNT,
    databaseProvider: parsed.DATABASE_PROVIDER,
    databaseUrl: parsed.DATABASE_URL,
    sqlitePath: parsed.SQLITE_PATH,
    pollIntervalMs: parsed.POLL_INTERVAL_SECONDS * 1000,
    postDrawIntervalMs: parsed.POST_DRAW_INTERVAL_SECONDS * 1000,
    experienceScanIntervalMs: parsed.EXPERIENCE_SCAN_INTERVAL_SECONDS * 1000,
    scheduledPostingEnabled: parsed.SCHEDULED_POSTING_ENABLED,
    logLevel: parsed.LOG_LEVEL
  };
}

import type { DatabaseProvider, DbClient } from "./client.js";

const baseSchemaSql = `
CREATE TABLE IF NOT EXISTS bot_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sleeping INTEGER NOT NULL DEFAULT 0,
  current_rhythm_date TEXT,
  wake_at TEXT,
  sleep_at TEXT,
  last_note_at TEXT,
  last_timeline_scan_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_notes (
  note_id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  host TEXT,
  note_created_at TEXT,
  visibility TEXT,
  cw INTEGER NOT NULL DEFAULT 0,
  sensitive INTEGER NOT NULL DEFAULT 0,
  reply_id TEXT,
  renote_id TEXT,
  url TEXT,
  text_summary TEXT,
  captured_at TEXT NOT NULL,
  deleted_or_unavailable INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS experience_source_consents (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  host TEXT,
  consent_status TEXT NOT NULL,
  pinned_consent_note_id TEXT,
  consented_reaction TEXT,
  consented_at TEXT,
  revoked_at TEXT,
  stopped_at TEXT,
  unfollowed_at TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consent_guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  guide_note_id TEXT,
  pinned_consent_note_id TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tl_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL,
  source_note_id TEXT,
  source_user_id TEXT,
  timeline TEXT NOT NULL,
  topic TEXT,
  summary TEXT NOT NULL,
  emotion TEXT,
  safety_class TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  used_in_post_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_note_id TEXT,
  source_user_id TEXT,
  picked_at TEXT NOT NULL,
  candidate_type TEXT,
  summary TEXT NOT NULL,
  emotion_hint TEXT,
  place_hint TEXT,
  action_hint TEXT,
  selection_reason TEXT,
  safety_class TEXT NOT NULL,
  quote_allowed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  rejected_reason TEXT,
  executed_post_id TEXT,
  executed_experience_log_id INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  source_note_id TEXT,
  source_user_id TEXT,
  experience_candidate_id INTEGER,
  experience_type TEXT,
  summary TEXT NOT NULL,
  emotion TEXT,
  importance INTEGER NOT NULL DEFAULT 1,
  posted_note_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  note_id TEXT PRIMARY KEY,
  posted_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  visibility TEXT,
  quote_source_note_id TEXT,
  source_experience_candidate_id INTEGER,
  source_experience_log_id INTEGER,
  source_tl_observation_id INTEGER,
  generated_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_note_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  drive_file_id TEXT,
  attached_at TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS reply_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_note_id TEXT NOT NULL,
  target_user_id TEXT,
  reply_note_id TEXT,
  replied_at TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications_seen (
  notification_id TEXT PRIMARY KEY,
  notification_type TEXT,
  user_id TEXT,
  note_id TEXT,
  seen_at TEXT NOT NULL,
  handled_at TEXT,
  action TEXT
);

CREATE TABLE IF NOT EXISTS notes_seen (
  note_id TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL,
  purpose TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  related_user_id TEXT,
  related_note_id TEXT
);

CREATE TABLE IF NOT EXISTS m_post_kind (
  kind TEXT PRIMARY KEY,
  priority INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS m_safety_rule (
  rule_key TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  severity TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS m_rate_limit (
  scope TEXT PRIMARY KEY,
  limit_count INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS m_command (
  command TEXT PRIMARY KEY,
  meaning TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS m_emotion_asset (
  asset_key TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  emotion TEXT,
  post_kind TEXT,
  event_tag TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  description TEXT
);

CREATE TABLE IF NOT EXISTS m_runtime_setting (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_notes_user ON source_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON experience_candidates(status, picked_at);
CREATE INDEX IF NOT EXISTS idx_logs_posted_note ON experience_logs(posted_note_id);
CREATE INDEX IF NOT EXISTS idx_posts_kind_time ON posts(kind, posted_at);
CREATE INDEX IF NOT EXISTS idx_post_assets_post ON post_assets(post_note_id);
CREATE INDEX IF NOT EXISTS idx_observations_status ON tl_observations(status, observed_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_time ON rate_limit_events(event_type, event_at);
`;

export function schemaSql(provider: DatabaseProvider): string {
  if (provider === "sqlite") {
    return baseSchemaSql;
  }

  return baseSchemaSql.replaceAll(
    "INTEGER PRIMARY KEY AUTOINCREMENT",
    "INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY"
  );
}

export async function migrate(db: DbClient, provider: DatabaseProvider): Promise<void> {
  await db.exec(schemaSql(provider));
  const now = new Date().toISOString();
  await db.run(
    `
    INSERT INTO bot_state (id, created_at, updated_at)
    VALUES (1, @now, @now)
    ON CONFLICT(id) DO NOTHING
    `,
    { now }
  );
  await seedRuntimeSettings(db, now);
}

async function seedRuntimeSettings(db: DbClient, now: string): Promise<void> {
  const settings = [
    ["SCHEDULED_POST_MIN_INTERVAL_MINUTES", "5", "integer", "scheduling", "Hard minimum minutes between normal posts."],
    ["POST_PROBABILITY_5_MIN", "0.10", "number", "scheduling", "Post probability after 5 minutes."],
    ["POST_PROBABILITY_10_MIN", "0.15", "number", "scheduling", "Post probability after 10 minutes."],
    ["POST_PROBABILITY_30_MIN", "0.80", "number", "scheduling", "Post probability after 30 minutes."],
    ["POST_PROBABILITY_60_MIN", "0.95", "number", "scheduling", "Post probability after 60 minutes."],
    ["FOLLOW_PROBE_MAX_PER_POLL", "1", "integer", "polling", "Maximum follow notifications handled per poll."],
    ["REPLY_PROBE_MAX_PER_POLL", "1", "integer", "polling", "Maximum reply notifications handled per poll."],
    ["NOTIFICATION_FETCH_LIMIT", "20", "integer", "polling", "Notification fetch limit."],
    ["REACTION_FETCH_LIMIT", "100", "integer", "polling", "Reaction fetch limit."],
    ["NOTES_PER_HOUR", "5", "integer", "rate_limit", "Maximum notes per hour."],
    ["NOTES_PER_DAY", "50", "integer", "rate_limit", "Maximum notes per day."],
    ["QUOTE_RENOTES_PER_DAY", "5", "integer", "rate_limit", "Maximum quote renotes per day."],
    ["USER_TRIGGERED_POSTS_PER_5MIN", "5", "integer", "rate_limit", "Maximum user-triggered posts per five minutes."],
    ["USER_TRIGGERED_COOLDOWN_SECONDS", "300", "integer", "rate_limit", "Cooldown after user-triggered post burst."],
    ["TL_OBSERVATION_NOTE_COUNT", "20", "integer", "timeline", "Number of notes used for TL observation."],
    ["TL_OBSERVATION_POST_PROBABILITY", "0.20", "number", "timeline", "Probability to post TL observation."],
    ["QUOTE_RENOTE_PROBABILITY", "0.20", "number", "experience", "Probability to quote renote when using an experience source."],
    ["EMOTION_ASSET_DEFAULT_COOLDOWN_HOURS", "24", "integer", "asset", "Default cooldown hours for emotion assets."],
    ["AI_PRIMARY_PROVIDER", "chutes", "string", "ai", "Primary AI provider."],
    ["AI_FALLBACK_PROVIDER", "openai", "string", "ai", "Fallback AI provider."],
    ["AI_FALLBACK_ENABLED", "true", "boolean", "ai", "Whether fallback provider can be used."],
    ["CHUTES_BASE_URL", "https://llm.chutes.ai/v1", "string", "ai", "Chutes OpenAI-compatible base URL."],
    ["CHUTES_MODEL_TEXT", "moonshotai/Kimi-K2.5-TEE", "string", "ai", "Chutes model for text generation."],
    ["CHUTES_MODEL_CLASSIFIER", "moonshotai/Kimi-K2.5-TEE", "string", "ai", "Chutes model for classification."],
    ["CHUTES_TIMEOUT_MS", "30000", "integer", "ai", "Chutes request timeout in milliseconds."],
    ["CHUTES_MAX_RETRIES", "1", "integer", "ai", "Chutes retry count."],
    ["OPENAI_BASE_URL", "https://api.openai.com/v1", "string", "ai", "OpenAI base URL."],
    ["OPENAI_MODEL_TEXT", "gpt-5.4-mini", "string", "ai", "OpenAI fallback model for text generation."],
    ["OPENAI_MODEL_CLASSIFIER", "gpt-5.4-mini", "string", "ai", "OpenAI fallback model for classification."],
    ["OPENAI_TIMEOUT_MS", "30000", "integer", "ai", "OpenAI request timeout in milliseconds."],
    ["OPENAI_MAX_RETRIES", "1", "integer", "ai", "OpenAI retry count."],
    ["AI_DAILY_MAX_REQUESTS", "200", "integer", "ai", "Daily maximum AI requests."],
    ["AI_DAILY_MAX_FALLBACK_REQUESTS", "30", "integer", "ai", "Daily maximum fallback provider requests."],
    ["AI_POST_GENERATION_MAX_TOKENS", "600", "integer", "ai", "Maximum text generation tokens."],
    ["AI_CLASSIFIER_MAX_TOKENS", "300", "integer", "ai", "Maximum classifier tokens."],
    ["AI_TEMPERATURE_TEXT", "0.8", "number", "ai", "Text generation temperature."],
    ["AI_TEMPERATURE_CLASSIFIER", "0.0", "number", "ai", "Classifier temperature."],
    ["AI_REQUIRE_CLASSIFIER_PASS", "true", "boolean", "ai", "Whether classifier pass is required before posting."],
    ["AI_SKIP_POST_ON_AI_FAILURE", "true", "boolean", "ai", "Skip posting when AI fails."],
    ["AI_SKIP_POST_ON_FALLBACK_FAILURE", "true", "boolean", "ai", "Skip posting when fallback also fails."],
    ["AI_LOG_PROMPT", "false", "boolean", "ai", "Whether prompt text can be logged."],
    ["AI_LOG_RESPONSE_SUMMARY", "true", "boolean", "ai", "Whether response summaries can be logged."],
    ["BETA_TEST1_ENABLED", "false", "boolean", "beta", "beta-test1 mode: quote RN 40%, elapsed x5 for normal posts."],
    ["EXPERIENCE_MEMORY_ENABLED", "true", "boolean", "experience_memory", "Enable experience memory influence on normal posts."],
    ["EXPERIENCE_MEMORY_ENABLED", "true", "boolean", "experience_memory", "Enable experience memory influence on normal posts."],
    ["EXPERIENCE_MEMORY_SAMPLE_COUNT", "50", "integer", "experience_memory", "Number of random experience_logs to sample for prompt context."],
    ["EXPERIENCE_MEMORY_PROMPT_WEIGHT", "50", "integer", "experience_memory", "Influence strength of experience memory in prompt (0-100)."],
    ["TL_REFERENCE_PROBABILITY", "0.50", "number", "gacha", "Probability that a normal post will reference the timeline."],
    ["TL_VIBE_RATIO", "0.75", "number", "gacha", "Within TL references, ratio of vibe-style mentions."],
  ];

  for (const [key, value, valueType, category, description] of settings) {
    await db.run(
      `
      INSERT INTO m_runtime_setting (setting_key, setting_value, value_type, category, description, updated_at)
      VALUES (@key, @value, @valueType, @category, @description, @updatedAt)
      ON CONFLICT(setting_key) DO NOTHING
      `,
      { key, value, valueType, category, description, updatedAt: now }
    );
  }
}

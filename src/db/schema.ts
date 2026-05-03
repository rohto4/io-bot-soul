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
    ["SCHEDULED_POST_MIN_INTERVAL_MINUTES", "5", "integer", "scheduling", "通常投稿の最短間隔（分）。この時間未満は必ずskip。"],
    ["POST_PROBABILITY_5_MIN", "0.10", "number", "scheduling", "前回投稿から5分後の投稿確率。"],
    ["POST_PROBABILITY_10_MIN", "0.15", "number", "scheduling", "前回投稿から10分後の投稿確率。"],
    ["POST_PROBABILITY_30_MIN", "0.80", "number", "scheduling", "前回投稿から30分後の投稿確率。"],
    ["POST_PROBABILITY_60_MIN", "0.95", "number", "scheduling", "前回投稿から60分以上後の投稿確率（上限）。"],
    ["POLL_INTERVAL_SECONDS", "60", "integer", "scheduling", "フォロー・リプライ・❤確認のpolling間隔（秒）。"],
    ["POST_DRAW_INTERVAL_SECONDS", "300", "integer", "scheduling", "投稿抽選の実行間隔（秒）。デフォルト5分。"],
    ["EXPERIENCE_SCAN_INTERVAL_SECONDS", "1200", "integer", "scheduling", "体験候補蓄積バッチの実行間隔（秒）。デフォルト20分。"],
    ["FOLLOW_PROBE_MAX_PER_POLL", "1", "integer", "polling", "1回のpollで処理するフォロー通知の最大件数。"],
    ["REPLY_PROBE_MAX_PER_POLL", "1", "integer", "polling", "1回のpollで返信するリプライの最大件数。"],
    ["NOTIFICATION_FETCH_LIMIT", "20", "integer", "polling", "1回のpollで取得する通知の件数。"],
    ["REACTION_FETCH_LIMIT", "100", "integer", "polling", "ピン留め同意ノートの❤リアクション確認件数。"],
    ["NOTES_PER_HOUR", "5", "integer", "rate_limit", "1時間あたりの最大投稿数（Phase 6で実装予定、現在未適用）。"],
    ["NOTES_PER_DAY", "50", "integer", "rate_limit", "1日あたりの最大投稿数（Phase 6で実装予定、現在未適用）。"],
    ["QUOTE_RENOTES_PER_DAY", "5", "integer", "rate_limit", "1日あたりの最大引用RN数（Phase 6で実装予定、現在未適用）。"],
    ["USER_TRIGGERED_POSTS_PER_5MIN", "5", "integer", "rate_limit", "ユーザー操作起因の投稿上限（5分あたり）。Phase 6で実装予定。"],
    ["USER_TRIGGERED_COOLDOWN_SECONDS", "300", "integer", "rate_limit", "ユーザー操作投稿バースト後のクールダウン（秒）。Phase 6で実装予定。"],
    ["TL_OBSERVATION_NOTE_COUNT", "20", "integer", "timeline", "TLスキャン1回で取得するノート数。"],
    ["TL_OBSERVATION_POST_PROBABILITY", "0.20", "number", "timeline", "（v1互換・未使用）TL観測投稿の確率。v2ではQUOTE_RENOTE_PROBABILITYとTL_REFERENCE_PROBABILITYに分離。"],
    ["QUOTE_RENOTE_PROBABILITY", "0.20", "number", "experience", "5分tickで引用RNガチャに入る確率（独立抽選）。"],
    ["QUOTE_RENOTE_TL_LIMIT", "100", "integer", "experience", "引用RN候補選定のためにホームTLから取得するノート数。"],
    ["QUOTE_RENOTE_RECENT_USER_EXCLUDE", "5", "integer", "experience", "直近N回の引用RN済みユーザーを次回候補から除外する件数。"],
    ["EMOTION_ASSET_DEFAULT_COOLDOWN_HOURS", "24", "integer", "asset", "エモーション画像の標準クールダウン（時間）。同じ画像の連続使用を防ぐ。Phase 7で使用。"],
    ["AI_PRIMARY_PROVIDER", "chutes", "string", "ai", "メインAIプロバイダー名（chutes / openai）。"],
    ["AI_FALLBACK_PROVIDER", "openai", "string", "ai", "fallback AIプロバイダー名。"],
    ["AI_FALLBACK_ENABLED", "true", "boolean", "ai", "fallbackプロバイダーを使用するか。"],
    ["CHUTES_BASE_URL", "https://llm.chutes.ai/v1", "string", "ai", "Chutes API のベースURL（OpenAI互換）。"],
    ["CHUTES_MODEL_TEXT", "moonshotai/Kimi-K2.5-TEE", "string", "ai", "Chutesの本文生成モデルID。"],
    ["CHUTES_MODEL_CLASSIFIER", "moonshotai/Kimi-K2.5-TEE", "string", "ai", "Chutesの安全分類モデルID。"],
    ["CHUTES_TIMEOUT_MS", "30000", "integer", "ai", "Chutesリクエストのタイムアウト（ミリ秒）。"],
    ["CHUTES_MAX_RETRIES", "1", "integer", "ai", "Chutesのリトライ回数。"],
    ["OPENAI_BASE_URL", "https://api.openai.com/v1", "string", "ai", "OpenAI APIのベースURL。"],
    ["OPENAI_MODEL_TEXT", "gpt-5.4-mini", "string", "ai", "OpenAI fallbackの本文生成モデルID。"],
    ["OPENAI_MODEL_CLASSIFIER", "gpt-5.4-mini", "string", "ai", "OpenAI fallbackの安全分類モデルID。"],
    ["OPENAI_TIMEOUT_MS", "30000", "integer", "ai", "OpenAIリクエストのタイムアウト（ミリ秒）。"],
    ["OPENAI_MAX_RETRIES", "1", "integer", "ai", "OpenAIのリトライ回数。"],
    ["AI_DAILY_MAX_REQUESTS", "200", "integer", "ai", "AI APIの1日あたり最大リクエスト数（Phase 6で実装予定）。"],
    ["AI_DAILY_MAX_FALLBACK_REQUESTS", "30", "integer", "ai", "fallback AIの1日あたり最大リクエスト数（Phase 6で実装予定）。"],
    ["AI_POST_GENERATION_MAX_TOKENS", "600", "integer", "ai", "本文生成の最大トークン数。Kimiは推論トークンを消費するので小さくしすぎない。"],
    ["AI_CLASSIFIER_MAX_TOKENS", "300", "integer", "ai", "安全分類の最大トークン数。Kimiは推論トークンを消費するので小さくしすぎない。"],
    ["AI_TEMPERATURE_TEXT", "0.8", "number", "ai", "本文生成のtemperature。高いほど多様、低いほど安定。"],
    ["AI_TEMPERATURE_CLASSIFIER", "0.0", "number", "ai", "安全分類のtemperature。判定は固定値0.0推奨。"],
    ["AI_REQUIRE_CLASSIFIER_PASS", "true", "boolean", "ai", "引用RN前の安全判定をパスしない場合に不採用にするか。"],
    ["AI_SKIP_POST_ON_AI_FAILURE", "true", "boolean", "ai", "AI生成失敗時に投稿をskipするか（false=固定テンプレートにfallback）。"],
    ["AI_SKIP_POST_ON_FALLBACK_FAILURE", "true", "boolean", "ai", "fallback AIも失敗した場合にskipするか。"],
    ["AI_LOG_PROMPT", "false", "boolean", "ai", "AIに渡すプロンプトをログ出力するか（デバッグ用）。"],
    ["AI_LOG_RESPONSE_SUMMARY", "true", "boolean", "ai", "AIのレスポンス概要をログ出力するか。"],
    ["BETA_TEST1_ENABLED", "false", "boolean", "beta", "beta-test1モード: 引用RN40%・経過時間5倍。DBで切り替え、再起動不要。"],
    ["EXPERIENCE_MEMORY_ENABLED", "true", "boolean", "experience_memory", "通常ノート生成時に体験メモリ（experience_logs）をプロンプトに注入するか。"],
    ["EXPERIENCE_MEMORY_SAMPLE_COUNT", "50", "integer", "experience_memory", "プロンプトに注入するexperience_logsのランダムサンプル件数。"],
    ["EXPERIENCE_MEMORY_PROMPT_WEIGHT", "50", "integer", "experience_memory", "体験メモリのプロンプト内影響度（0=無効 / 50=普通 / 100=最強）。"],
    ["TL_REFERENCE_PROBABILITY", "0.50", "number", "gacha", "通常ノート生成時にTLを参照する確率。"],
    ["TL_VIBE_RATIO", "0.75", "number", "gacha", "TL参照時に雰囲気言及（tl_vibe）を選ぶ比率（残り25%が特定言及tl_mention）。"],
    ["DEBUG_STATUS", "true", "boolean", "debug", "true のとき、ノート生成プロンプトを data/debug/ にファイル出力する。"],
    ["DAILY_CLEANUP_INTERVAL_SECONDS", "86400", "integer", "debug", "data/debug/ の古いプロンプトファイルを削除するバッチの実行間隔（秒）。デフォルト24時間。"],
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

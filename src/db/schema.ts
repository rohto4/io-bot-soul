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
}

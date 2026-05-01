# DB Schema

初期DBはSQLiteで開始したが、Docker常駐運用で安定して状態を保持するため、Neon/Postgresへ移行する。

このschemaは、ローカルPC常駐botのMVP実装に必要な最小構成とする。

## 接続方針

- `DATABASE_PROVIDER=postgres` の場合、`DATABASE_URL` でNeon/Postgresへ接続する。
- `DATABASE_PROVIDER=sqlite` の場合、`SQLITE_PATH` でSQLiteへ接続する。
- ローカルDockerは、Neon `DATABASE_URL` を使うことで投稿履歴、同意状態、体験ログを永続化する。
- SQLiteはテストとfallback用に残す。

## 方針

- 他者のnote本文は原則として丸ごと保存しない。
- 他者noteは、短い要約、分類、source id、採用判断だけを保存する。
- 自分の投稿は全文保存してよい。
- 体験は候補と実行済みに分ける。
- 同意、停止、参照除外をDBで判定できるようにする。
- rate limitとskip理由を保存し、後から運用確認できるようにする。

## Core Tables

### `bot_state`

単一のbot状態。

```sql
CREATE TABLE bot_state (
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
```

### `source_notes`

外部noteの最小限メタデータ。

```sql
CREATE TABLE source_notes (
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
```

### `experience_source_consents`

投稿参照への同意状態。

```sql
CREATE TABLE experience_source_consents (
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
```

`consent_status` 候補:

- `pending`
- `consented`
- `stopped`
- `unfollowed`
- `revoked`

### `consent_guides`

フォロー時に送ったピン留めノート案内。

```sql
CREATE TABLE consent_guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  guide_note_id TEXT,
  pinned_consent_note_id TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL
);
```

### `tl_observations`

個人を特定しないTL観測。

```sql
CREATE TABLE tl_observations (
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
```

### `experience_candidates`

体験候補。ここにあるだけでは体験済みとして扱わない。

```sql
CREATE TABLE experience_candidates (
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
```

`status` 候補:

- `pending`
- `executed`
- `rejected`
- `expired`

### `experience_logs`

実際にノートした後だけ保存する体験記憶。

```sql
CREATE TABLE experience_logs (
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
```

### `posts`

bot自身の投稿履歴。

```sql
CREATE TABLE posts (
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
```

`kind` 候補:

- `morning`
- `night`
- `sleep_talk`
- `tl_observation`
- `experience`
- `normal`
- `reply`
- `reaction_note`

### `post_assets`

投稿に添付した画像の履歴。

```sql
CREATE TABLE post_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_note_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  drive_file_id TEXT,
  attached_at TEXT NOT NULL,
  reason TEXT
);
```

### `reply_logs`

返信履歴。

```sql
CREATE TABLE reply_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_note_id TEXT NOT NULL,
  target_user_id TEXT,
  reply_note_id TEXT,
  replied_at TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL
);
```

### `notifications_seen`

処理済みnotification。

```sql
CREATE TABLE notifications_seen (
  notification_id TEXT PRIMARY KEY,
  notification_type TEXT,
  user_id TEXT,
  note_id TEXT,
  seen_at TEXT NOT NULL,
  handled_at TEXT,
  action TEXT
);
```

### `notes_seen`

処理済みnote。

```sql
CREATE TABLE notes_seen (
  note_id TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL,
  purpose TEXT NOT NULL
);
```

### `rate_limit_events`

投稿や引用RNのskip理由を残す。

```sql
CREATE TABLE rate_limit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  related_user_id TEXT,
  related_note_id TEXT
);
```

## Master Tables

初期実装ではコード定数でもよいが、運用調整を考えるならDB化する。

### `m_post_kind`

投稿種別と優先度。

```sql
CREATE TABLE m_post_kind (
  kind TEXT PRIMARY KEY,
  priority INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
```

### `m_safety_rule`

採用除外ルール。

```sql
CREATE TABLE m_safety_rule (
  rule_key TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  severity TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL
);
```

### `m_rate_limit`

投稿上限。

```sql
CREATE TABLE m_rate_limit (
  scope TEXT PRIMARY KEY,
  limit_count INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
```

初期値候補:

- `notes_per_hour`: 5 / 3600
- `notes_per_day`: 50 / 86400
- `quote_renotes_per_day`: 5 / 86400
- `user_triggered_posts_per_5min`: 5 / 300

### `m_command`

ユーザーコマンド。

```sql
CREATE TABLE m_command (
  command TEXT PRIMARY KEY,
  meaning TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
```

初期値候補:

- `/stop`: リプライや引用RNなどの接触停止。
- `/unfollow`: bot側から実際にフォロー解除し、ノート参照対象から除外。

### `m_emotion_asset`

投稿に添付する画像素材。

```sql
CREATE TABLE m_emotion_asset (
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
```

### `m_runtime_setting`

投稿確率、最短投稿間隔、取得limit、rate limit、AI provider、model id、timeout、retry、token上限、temperature、fallback方針などの非secret運用設定。

API keyは保存しない。`CHUTES_API_KEY` と `OPENAI_API_KEY` は `.env.local` に置く。

```sql
CREATE TABLE m_runtime_setting (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL
);
```

初期値候補:

- `SCHEDULED_POST_MIN_INTERVAL_MINUTES`: `5`
- `POST_PROBABILITY_5_MIN`: `0.10`
- `POST_PROBABILITY_10_MIN`: `0.15`
- `POST_PROBABILITY_30_MIN`: `0.80`
- `POST_PROBABILITY_60_MIN`: `0.95`
- `FOLLOW_PROBE_MAX_PER_POLL`: `1`
- `REPLY_PROBE_MAX_PER_POLL`: `1`
- `NOTIFICATION_FETCH_LIMIT`: `20`
- `REACTION_FETCH_LIMIT`: `100`
- `NOTES_PER_HOUR`: `5`
- `NOTES_PER_DAY`: `50`
- `QUOTE_RENOTES_PER_DAY`: `5`
- `USER_TRIGGERED_POSTS_PER_5MIN`: `5`
- `USER_TRIGGERED_COOLDOWN_SECONDS`: `300`
- `TL_OBSERVATION_NOTE_COUNT`: `20`
- `TL_OBSERVATION_POST_PROBABILITY`: `0.20`
- `QUOTE_RENOTE_PROBABILITY`: `0.20`
- `EMOTION_ASSET_DEFAULT_COOLDOWN_HOURS`: `24`
- `AI_PRIMARY_PROVIDER`: `chutes`
- `AI_FALLBACK_PROVIDER`: `openai`
- `AI_FALLBACK_ENABLED`: `true`
- `CHUTES_BASE_URL`: `https://llm.chutes.ai/v1`
- `CHUTES_MODEL_TEXT`: `moonshotai/Kimi-K2.5-TEE`
- `CHUTES_MODEL_CLASSIFIER`: `moonshotai/Kimi-K2.5-TEE`
- `CHUTES_TIMEOUT_MS`: `30000`
- `CHUTES_MAX_RETRIES`: `1`
- `OPENAI_BASE_URL`: `https://api.openai.com/v1`
- `OPENAI_MODEL_TEXT`: `gpt-5.4-mini`
- `OPENAI_MODEL_CLASSIFIER`: `gpt-5.4-mini`
- `OPENAI_TIMEOUT_MS`: `30000`
- `OPENAI_MAX_RETRIES`: `1`
- `AI_DAILY_MAX_REQUESTS`: `200`
- `AI_DAILY_MAX_FALLBACK_REQUESTS`: `30`
- `AI_POST_GENERATION_MAX_TOKENS`: `600`
- `AI_CLASSIFIER_MAX_TOKENS`: `300`
- `AI_TEMPERATURE_TEXT`: `0.8`
- `AI_TEMPERATURE_CLASSIFIER`: `0.0`
- `AI_REQUIRE_CLASSIFIER_PASS`: `true`
- `AI_SKIP_POST_ON_AI_FAILURE`: `true`
- `AI_SKIP_POST_ON_FALLBACK_FAILURE`: `true`
- `AI_LOG_PROMPT`: `false`
- `AI_LOG_RESPONSE_SUMMARY`: `true`

現在値確認SQL:

```sql
SELECT category, setting_key, setting_value, value_type, description
FROM m_runtime_setting
ORDER BY category, setting_key;
```

## Indexes

```sql
CREATE INDEX idx_source_notes_user ON source_notes(user_id);
CREATE INDEX idx_candidates_status ON experience_candidates(status, picked_at);
CREATE INDEX idx_logs_posted_note ON experience_logs(posted_note_id);
CREATE INDEX idx_posts_kind_time ON posts(kind, posted_at);
CREATE INDEX idx_post_assets_post ON post_assets(post_note_id);
CREATE INDEX idx_observations_status ON tl_observations(status, observed_at);
CREATE INDEX idx_rate_limit_time ON rate_limit_events(event_type, event_at);
```

## `note_exp_history` の扱い

MVPでは `note_exp_history` を物理テーブルとして採用しない。

実装は `tl_observations`、`experience_candidates`、`experience_logs`、`posts` の分割テーブルで進める。

`note_exp_history` は、あとから横断的に見るためのviewまたは集計層の候補名として残す。

## 未決

- safety判定をDB master中心にするか、コード定数中心にするか。

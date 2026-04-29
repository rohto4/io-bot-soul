# DB Schema

初期DBはSQLiteを使う。

このschemaは、ローカルPC常駐botのMVP実装に必要な最小構成とする。

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

## Indexes

```sql
CREATE INDEX idx_source_notes_user ON source_notes(user_id);
CREATE INDEX idx_candidates_status ON experience_candidates(status, picked_at);
CREATE INDEX idx_logs_posted_note ON experience_logs(posted_note_id);
CREATE INDEX idx_posts_kind_time ON posts(kind, posted_at);
CREATE INDEX idx_observations_status ON tl_observations(status, observed_at);
CREATE INDEX idx_rate_limit_time ON rate_limit_events(event_type, event_at);
```

## 未決

- `note_exp_history` を採用して統合履歴にするか、上記の分割テーブルで進めるか。
- safety判定をDB master中心にするか、コード定数中心にするか。

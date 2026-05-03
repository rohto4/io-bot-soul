# 運用設計ガイド

botの日常運用・緊急対応・設定変更・デプロイ手順をまとめる。

---

## 構成の全体像

```
.env.local         : MISSKEY_TOKEN / API keys / SCHEDULED_POSTING_ENABLED
                     → コンテナ起動時に読み込む。変更には restart が必要。

m_runtime_setting  : 投稿確率 / AI設定 / タイマー間隔 など
                     → DB上で管理。変更は SQL のみ。再起動不要（最大5分で反映）。

data/bot.sqlite    : 投稿履歴 / 同意情報 / ログ等のDB本体
                     → ./data/ にマウントされホスト側に残る。

data/debug/        : デバッグ用プロンプトファイル（DEBUG_STATUS=true 時）
                     → 24時間ごとに自動削除（dailyCleanup バッチ）。
```

---

## 緊急停止・復旧

### 投稿だけ止める（コンテナは維持）

`.env.local` の `SCHEDULED_POSTING_ENABLED` を `false` に変えて再起動：

```powershell
# .env.local を編集して SCHEDULED_POSTING_ENABLED=false に
docker compose restart bot
```

polling（フォロー返し・リプライ・❤確認）は継続する。

### 全停止

```powershell
docker compose down
```

### 復旧（投稿再開）

```powershell
# .env.local を SCHEDULED_POSTING_ENABLED=true に変更後
docker compose up -d
```

投稿再開前に直近の misskey.io 上の投稿から5分以上空いていることを確認すること。

---

## デプロイ手順（コード変更時）

```powershell
git pull                          # 最新コードを取得
docker compose up -d --build      # ビルド＋コンテナ再起動（1コマンドでOK）
docker compose logs -f bot        # ログで起動確認
```

`docker compose up -d --build` は以下を一括で行う：
1. イメージを再ビルド
2. コンテナを停止・起動
3. DB migration 実行（新テーブル・新設定値の追加）

**注意**: migration は `ON CONFLICT DO UPDATE` のため、`setting_value` はユーザーの変更を保持しつつ `description` 等のメタデータは更新される。

---

## DB設定値の変更

再起動不要。変更後、最大5分（次のtick）で反映される。

### 現在値の確認

```powershell
docker compose exec bot sqlite3 /app/data/bot.db \
  "SELECT category, setting_key, setting_value, description FROM m_runtime_setting ORDER BY category, setting_key;"
```

### 値を変更する

```powershell
docker compose exec bot sqlite3 /app/data/bot.db \
  "UPDATE m_runtime_setting SET setting_value='値', updated_at=datetime('now') WHERE setting_key='キー名';"
```

### よく使う変更

```sql
-- beta-test1 モード ON（引用RN 40%・通常ノート経過時間5倍）
UPDATE m_runtime_setting SET setting_value='true', updated_at=datetime('now') WHERE setting_key='BETA_TEST1_ENABLED';

-- beta-test1 モード OFF（通常モードに戻す）
UPDATE m_runtime_setting SET setting_value='false', updated_at=datetime('now') WHERE setting_key='BETA_TEST1_ENABLED';

-- デバッグファイル出力を止める
UPDATE m_runtime_setting SET setting_value='false', updated_at=datetime('now') WHERE setting_key='DEBUG_STATUS';

-- AI失敗時にテンプレートfallbackに切り替える（投稿が止まる時）
UPDATE m_runtime_setting SET setting_value='false', updated_at=datetime('now') WHERE setting_key='AI_SKIP_POST_ON_AI_FAILURE';
```

---

## 日常確認コマンド

### ログ監視

```powershell
# 全体ログ
docker compose logs -f bot

# 投稿関連のみ
docker compose logs -f bot | grep -E "postDraw|scheduledPost|quoteRenote|tlVibe|tlMention|no_tl"

# エラーのみ
docker compose logs -f bot | grep -E "error|Error|FAILED"

# タイマー確認（起動時に出力）
docker compose logs bot | grep "bot.timers.configured"
```

### コンテナ状態確認

```powershell
docker compose ps          # 起動中か確認
docker compose stats bot   # CPU/メモリ使用状況
```

### DB確認クエリ集

```sql
-- 直近の投稿10件
SELECT note_id, posted_at, kind, generated_reason, text FROM posts ORDER BY posted_at DESC LIMIT 10;

-- generated_reason の分布（v2ガチャ動作確認）
SELECT generated_reason, COUNT(*) AS cnt FROM posts WHERE kind IN ('normal','quote_renote') GROUP BY generated_reason ORDER BY cnt DESC;

-- 引用RN体験ログ
SELECT experience_type, summary, occurred_at FROM experience_logs ORDER BY occurred_at DESC LIMIT 10;

-- 許可済みユーザー一覧
SELECT user_id, username, consent_status, consented_at FROM experience_source_consents WHERE consent_status = 'consented';

-- 停止・フォロー解除中のユーザー
SELECT user_id, username, consent_status, stopped_at, unfollowed_at FROM experience_source_consents WHERE consent_status IN ('stopped','unfollowed');

-- 体験候補の蓄積状況
SELECT candidate_type, status, COUNT(*) AS cnt FROM experience_candidates GROUP BY candidate_type, status;

-- source_notes テーブルのサイズ確認
SELECT COUNT(*) AS total, MIN(captured_at) AS oldest, MAX(captured_at) AS newest FROM source_notes;

-- bot_state（最終投稿・最終TLスキャン）
SELECT last_note_at, last_timeline_scan_at, updated_at FROM bot_state WHERE id = 1;
```

---

## ログキーの読み方

### 正常ログ（定期的に出るべきもの）

| ログキー | 意味 | 頻度 |
|---|---|---|
| `poll.tick` | polling 開始 | 毎分 |
| `postDraw.tick` | 投稿抽選開始 | 5分ごと |
| `experienceScan.tick` | 体験候補スキャン開始 | 20分ごと |
| `dailyCleanup.tick` | デバッグファイル削除バッチ開始 | 24時間ごと |
| `scheduledPost.posted` | 通常ノート投稿成功 | 投稿時 |
| `quoteRenote.posted` | 引用RN投稿成功 | 引用RN時 |
| `bot.timers.configured` | タイマー設定完了（起動時） | 起動時1回 |

### skip ログ（正常な不投稿）

| ログキー + reason | 意味 |
|---|---|
| `scheduledPost.skip: disabled` | `SCHEDULED_POSTING_ENABLED=false` |
| `scheduledPost.skip: min_interval` | 最短間隔未満でskip |
| `scheduledPost.skip: probability` | 確率テーブルで外れてskip |
| `scheduledPost.tlFallback: too_few_summaries` | TL不足でno_tlにフォールバック |
| `quoteRenote.skip: no_candidate` | 引用RN候補なし |
| `quotePick.skip: no_consented_users` | 許可済みユーザーが0人 |
| `quotePick.skip: no_candidates_in_tl` | TLに許可済みユーザーのノートなし |
| `postDraw.skip: already_running` | 前の処理が実行中（重複防止） |

### 要注意ログ

| ログキー | 意味 | 対処 |
|---|---|---|
| `*.error` | 予期しないエラー | ログ詳細を確認 |
| `ai.fallback` | Chutes失敗、OpenAIにfallback | Chutes APIの状態確認 |
| `ai.failure` | AI両方失敗 | API key・疎通確認 |

---

## .env.local の管理

secretはここに置く。**Gitには入れない**。

```dotenv
# Misskey
MISSKEY_HOST=https://misskey.io
MISSKEY_TOKEN=（Misskey API トークン）
PINNED_CONSENT_NOTE_ID=（ピン留め同意ノートのID）
ADMIN_ACCOUNT=@unibell4

# DB
DATABASE_PROVIDER=sqlite
SQLITE_PATH=/app/data/bot.sqlite
# DATABASE_PROVIDER=postgres
# DATABASE_URL=postgresql://...

# 投稿スイッチ（最終安全スイッチ）
SCHEDULED_POSTING_ENABLED=true

# AI API keys
CHUTES_API_KEY=（Chutes API key）
OPENAI_API_KEY=（OpenAI API key）

# ログレベル（debug / info / warn / error）
LOG_LEVEL=info
```

**変更後は必ず再起動**:

```powershell
docker compose restart bot
```

---

## DBバックアップ

```powershell
# SQLite のバックアップ（コンテナ外からコピー）
copy "G:\devwork\io-bot-soul\data\bot.sqlite" "G:\devwork\io-bot-soul\data\bot_backup_$(Get-Date -Format 'yyyyMMdd').sqlite"

# または Docker 経由でダンプ
docker compose exec bot sqlite3 /app/data/bot.db ".backup /app/data/bot_backup.sqlite"
```

---

## トラブルシューティング

### botが投稿しない

1. `SCHEDULED_POSTING_ENABLED=true` か確認
2. `postDraw.tick` がログに出ているか確認
3. skip理由を確認: `docker compose logs bot | grep "scheduledPost.skip"`
4. AI失敗の場合: `AI_SKIP_POST_ON_AI_FAILURE=false` でテンプレートfallbackに切り替えて動作確認

### 同じ内容のノートが繰り返される

- `DEBUG_STATUS=true` にしてプロンプトを `data/debug/` で確認
- `[USER]` セクションの直前2件全文と禁止フレーズを確認

### 引用RNが同じノートを繰り返す

- `quotePick.candidates` ログで `excludedUsers` が機能しているか確認
- `experience_logs` に引用RN記録が蓄積されているか確認:
  ```sql
  SELECT source_user_id, source_note_id, occurred_at FROM experience_logs WHERE experience_type='quote_renote' ORDER BY occurred_at DESC LIMIT 10;
  ```

### Docker が起動しない

```powershell
docker compose logs bot   # エラーメッセージを確認
docker compose down
docker compose up -d --build   # 再ビルドから
```

### PC再起動後に bot が動いていない

Docker Desktop の「起動時に実行」設定を確認。
`restart: unless-stopped` が `compose.yaml` に入っていれば、Docker Desktop 起動後に自動復旧する。

---

## 関連ドキュメント

- [`docs/spec/operation-settings.md`](../spec/operation-settings.md) — 設定値の全一覧・意味・調整方針
- [`docs/spec/posting-runtime-rules.md`](../spec/posting-runtime-rules.md) — 投稿可否の判定フロー詳細
- [`docs/spec/action-flow-v2.md`](../spec/action-flow-v2.md) — 行動ガチャのフロー設計
- [`docs/imp/user-tasks.md`](../imp/user-tasks.md) — 次にやるべきタスク・確認事項

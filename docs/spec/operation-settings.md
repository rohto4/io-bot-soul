# 運用設定リファレンス

このドキュメントは、botの動作を制御する設定値を人間が読める形でまとめたものです。
DBの `m_runtime_setting` テーブルに保存され、`docker compose restart` 不要で即時反映されます（最大5分）。

## 設定値の確認・変更方法

```sql
-- 現在値を確認
SELECT setting_key, setting_value, description
FROM m_runtime_setting
ORDER BY category, setting_key;

-- 例: beta-test1モードを有効化
UPDATE m_runtime_setting
SET setting_value = 'true', updated_at = datetime('now')
WHERE setting_key = 'BETA_TEST1_ENABLED';

-- 例: 引用RN確率を20%に変更（通常モード）
UPDATE m_runtime_setting
SET setting_value = '0.20', updated_at = datetime('now')
WHERE setting_key = 'QUOTE_RENOTE_PROBABILITY';
```

## 行動ガチャ確率（5分tickあたり） V2

### 独立ガチャ構造

V2では、従来の「TL観測に入ってから引用RNガチャ」という階層構造を廃止し、各アクションを独立した確率で直接抽選します。

```
【通常モード】                    【beta-test1モード】
引用RN: 20%                       引用RN: 40%
通常ノート: 80%                   通常ノート: 60%
  ├─ TL参照なし: 50%                ├─ TL参照なし: 33%
  │   → 全体確率: 40%               │   → 全体確率: 20%
  │
  └─ TL参照あり: 50%                └─ TL参照あり: 67%
      ├─ 雰囲気言及: 75%                ├─ 雰囲気言及: 75%
      │   → 全体確率: 30%               │   → 全体確率: 30%
      └─ 特定言及: 25%                  └─ 特定言及: 25%
          → 全体確率: 10%                 → 全体確率: 10%
```

### 通常モード（BETA_TEST1_ENABLED = false）

| 行動 | 全体確率 | 計算式 | 投稿種別 |
|---|---|---|---|
| **引用RN投稿** | **20%** | `QUOTE_RENOTE_PROBABILITY` | `quote_renote` |
| **通常ノート（TL参照なし）** | **40%** | (1 - 0.20) × 0.50 | `normal` (no_tl) |
| **通常ノート（TL雰囲気言及）** | **30%** | (1 - 0.20) × 0.50 × 0.75 | `normal` (tl_vibe) |
| **通常ノート（TL特定言及）** | **10%** | (1 - 0.20) × 0.50 × 0.25 | `normal` (tl_mention) |

### beta-test1モード（BETA_TEST1_ENABLED = true）

| 行動 | 全体確率 | 計算式 | 投稿種別 |
|---|---|---|---|
| **引用RN投稿** | **40%** | `QUOTE_RENOTE_PROBABILITY` (beta値) | `quote_renote` |
| **通常ノート（TL参照なし）** | **20%** | (1 - 0.40) × 0.33 | `normal` (no_tl) |
| **通常ノート（TL雰囲気言及）** | **30%** | (1 - 0.40) × 0.67 × 0.75 | `normal` (tl_vibe) |
| **通常ノート（TL特定言及）** | **10%** | (1 - 0.40) × 0.67 × 0.25 | `normal` (tl_mention) |

**beta-test1モードの切り替え:**
```sql
UPDATE m_runtime_setting SET setting_value = 'true',  updated_at = datetime('now') WHERE setting_key = 'BETA_TEST1_ENABLED';
-- または無効化
UPDATE m_runtime_setting SET setting_value = 'false', updated_at = datetime('now') WHERE setting_key = 'BETA_TEST1_ENABLED';
```

## 通常ノート確率テーブル（経過時間別）

直近通常ノートからの経過時間に応じた投稿確率。線形補間されます。

| 経過時間 | 確率 | DBキー | 備考 |
|---|---|---|---|
| 5分未満 | **0%** | - | 必ずskip（最短間隔） |
| 5分 | **10%** | `POST_PROBABILITY_5_MIN` | |
| 10分 | **15%** | `POST_PROBABILITY_10_MIN` | |
| 30分 | **80%** | `POST_PROBABILITY_30_MIN` | |
| 60分以上 | **95%** | `POST_PROBABILITY_60_MIN` | 上限 |

**beta-test1モード時:** 上記の経過時間が**5倍**で計算されます。
例: 実際に30分経過 → 6分相当(10%)として判定

## ガチャ・TL参照設定

### 行動ガチャ

| 設定 | 初期値 | DBキー | 説明 |
|---|---|---|---|
| **引用RN確率** | 0.20 | `QUOTE_RENOTE_PROBABILITY` | 5分tickでの引用RN確率 |
| **TL参照確率** | 0.50 | `TL_REFERENCE_PROBABILITY` | 通常ノートのうちTLを参照する確率 |
| **雰囲気言及比率** | 0.75 | `TL_VIBE_RATIO` | TL参照時の雰囲気言及の比率 |
| **特定言及比率** | 0.25 | `TL_MENTION_RATIO` | TL参照時の特定事象言及の比率 |

### TLスキャン設定

| 設定 | 初期値 | DBキー | 説明 |
|---|---|---|---|
| TL取得ノート数 | 20 | `TL_OBSERVATION_NOTE_COUNT` | 1回のスキャンで取得するノート数 |
| TL観測最小投稿数 | 3 | `TL_OBSERVATION_MIN_POSTS` | summariesがこれ未満でskip |

## 投稿間隔・タイミング

| 設定 | 初期値 | 環境変数/DBキー | 説明 |
|---|---|---|---|
| 最短投稿間隔 | 5分 | `SCHEDULED_POST_MIN_INTERVAL_MINUTES` | この間隔未満は必ずskip |
| ポーリング間隔 | 60秒 | `POLL_INTERVAL_SECONDS` | フォロー・リプライ・❤確認の間隔 |
| post-draw間隔 | 300秒 | `POST_DRAW_INTERVAL_SECONDS` | 投稿抽選の間隔（5分） |
| 体験スキャン間隔 | 600秒 | `EXPERIENCE_SCAN_INTERVAL_SECONDS` | 体験候補蓄積の間隔（10分） |

## 体験メモリ設定

| 設定 | 初期値 | DBキー | 説明 |
|---|---|---|---|
| **有効/無効** | true | `EXPERIENCE_MEMORY_ENABLED` | 体験メモリのON/OFF |
| **サンプル件数** | 50 | `EXPERIENCE_MEMORY_SAMPLE_COUNT` | `experience_logs`からランダム取得する件数 |
| **影響度** | 50 | `EXPERIENCE_MEMORY_PROMPT_WEIGHT` | プロンプト内の影響度（0〜100） |

**影響度の目安:**
- 0: 注入なし（OFFと同等）
- 25: 弱い（文末に記録一覧を簡潔に提示）
- **50: 普通（初期設定）**
- 75: 強い（文脈前に配置、詳細な記録）
- 100: 最強（systemPromptと統合）

## AI設定

### Provider・モデル

| 設定 | 初期値 | DBキー |
|---|---|---|
| Primary Provider | chutes | `AI_PRIMARY_PROVIDER` |
| Fallback Provider | openai | `AI_FALLBACK_PROVIDER` |
| Fallback有効 | true | `AI_FALLBACK_ENABLED` |

### Chutes

| 設定 | 初期値 | DBキー |
|---|---|---|
| ベースURL | https://llm.chutes.ai/v1 | `CHUTES_BASE_URL` |
| 本文生成モデル | moonshotai/Kimi-K2.5-TEE | `CHUTES_MODEL_TEXT` |
| 分類モデル | moonshotai/Kimi-K2.5-TEE | `CHUTES_MODEL_CLASSIFIER` |
| タイムアウト | 30000ms | `CHUTES_TIMEOUT_MS` |
| 最大リトライ | 1 | `CHUTES_MAX_RETRIES` |

### OpenAI（fallback）

| 設定 | 初期値 | DBキー |
|---|---|---|
| ベースURL | https://api.openai.com/v1 | `OPENAI_BASE_URL` |
| 本文生成モデル | gpt-4o-mini | `OPENAI_MODEL_TEXT` |
| 分類モデル | gpt-4o-mini | `OPENAI_MODEL_CLASSIFIER` |
| タイムアウト | 30000ms | `OPENAI_TIMEOUT_MS` |
| 最大リトライ | 1 | `OPENAI_MAX_RETRIES` |

### 生成パラメータ

| 設定 | 初期値 | DBキー | 説明 |
|---|---|---|---|
| 本文生成token上限 | 600 | `AI_POST_GENERATION_MAX_TOKENS` | |
| 分類token上限 | 300 | `AI_CLASSIFIER_MAX_TOKENS` | Kimiは推論token消費注意 |
| 本文temperature | 0.8 | `AI_TEMPERATURE_TEXT` | 高いほど多様 |
| 分類temperature | 0.0 | `AI_TEMPERATURE_CLASSIFIER` | 判定は固定 |
| 分類必須 | true | `AI_REQUIRE_CLASSIFIER_PASS` | NG判定時は採用しない |

### 動作設定

| 設定 | 初期値 | DBキー | 説明 |
|---|---|---|---|
| AI失敗時skip | true | `AI_SKIP_POST_ON_AI_FAILURE` | true=投稿しない、false=テンプレートfallback |
| fallback失敗時skip | true | `AI_SKIP_POST_ON_FALLBACK_FAILURE` | |
| ログ出力（prompt） | false | `AI_LOG_PROMPT` | デバッグ用 |
| ログ出力（response） | true | `AI_LOG_RESPONSE_SUMMARY` | |
| 日次最大リクエスト | 200 | `AI_DAILY_MAX_REQUESTS` | Phase 6で実装予定 |
| 日次最大fallback | 30 | `AI_DAILY_MAX_FALLBACK_REQUESTS` | Phase 6で実装予定 |

## 投稿制限（rate limit）※Phase 6で実装予定

| 制限 | 初期値 | DBキー | 状態 |
|---|---|---|---|
| 1時間あたり最大ノート数 | 5 | `NOTES_PER_HOUR` | DB値のみ（未適用） |
| 1日あたり最大ノート数 | 50 | `NOTES_PER_DAY` | DB値のみ（未適用） |
| 1日あたり最大引用RN数 | 5 | `QUOTE_RENOTES_PER_DAY` | DB値のみ（未適用） |
| ユーザー操作投稿/5分 | 5 | `USER_TRIGGERED_POSTS_PER_5MIN` | DB値のみ（未適用） |
| ユーザー操作クールダウン | 300秒 | `USER_TRIGGERED_COOLDOWN_SECONDS` | DB値のみ（未適用） |

## フォロー・リプライ設定

| 設定 | 初期値 | DBキー | 説明 |
|---|---|---|---|
| 1回のpollで処理するフォロー数 | 1 | `FOLLOW_PROBE_MAX_PER_POLL` | フォロー返し上限 |
| 1回のpollで返信するリプライ数 | 1 | `REPLY_PROBE_MAX_PER_POLL` | 連続返信上限 |
| 通知取得数 | 20 | `NOTIFICATION_FETCH_LIMIT` | |
| リアクション取得数 | 100 | `REACTION_FETCH_LIMIT` | ピン留め同意ノートの❤確認 |

## コード固定値（DB化検討中）

以下は `src/note-hint.ts` にコード固定されている値：

| 項目 | 値 | 説明 |
|---|---|---|
| normal深度 | 90% | 過去投稿参照なし |
| reminisce深度 | 5% | ランダム過去投稿参照 |
| reference深度 | 5% | 特定過去投稿への言及 |
| お題数 | 20種 | topics配列 |
| 口調数 | 6種 | tones配列 |
| 文体パターン数 | 4種 | noteStyles配列（normal時のみ） |

## 確認コマンド

```bash
# 新ガチャの動作確認
docker compose logs -f bot | grep -E "postDraw|scheduledPost|quoteRenote|tlVibe|tlMention|no_tl|experienceScan"

# 現在のDB設定値確認（SQLite）
docker compose exec bot sqlite3 /app/data/bot.db "SELECT setting_key, setting_value FROM m_runtime_setting ORDER BY setting_key;"

# Postgres使用時
docker compose exec bot psql $DATABASE_URL -c "SELECT setting_key, setting_value FROM m_runtime_setting ORDER BY setting_key;"
```

## 関連設計書

- `docs/spec/action-flow-v2.md` - 行動フローV2の詳細設計

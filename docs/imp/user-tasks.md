# User Tasks

ユーザーが実際に消化する作業と、作業後に見る確認事項を分ける。

## 直近の確認タスク（action-flow-v2 反映後）

`docker compose up -d --build` は 2026-05-03 に実施済み。

反映後の動作確認:
```
docker compose logs -f bot | grep -E "postDraw|quoteRenote|no_tl|tl_vibe|tl_mention|experienceScan"
```

- `postDraw.tick` が5分ごとに出ていること
- `experienceScan.tick` が10分ごとに出ていること
- `generated_reason` に `no_tl` / `tl_vibe` / `tl_mention` / `quote_renote` が出ていること

## 次フェーズ判断タスク

- **投稿多様性の確認**: 文体パターン・お題・口調のガチャが機能しているか実際のノートで確認。同じ構成が続くようなら `note-hint.ts` の4パターンを増やすか調整する。
- **引用RN実績確認**: `experience_logs` に引用RNのレコードが蓄積されているか確認する。
  ```sql
  SELECT experience_type, summary, occurred_at FROM experience_logs ORDER BY occurred_at DESC LIMIT 10;
  ```
- **beta-test1テスト**: テスター募集前に `BETA_TEST1_ENABLED=true` で動作を手動確認する。
- **Phase 4着手判断**: `experience_scan.ts` の土台（TL→AI安全判定→`experience_candidates` 保存）は実装済み。Phase 4本体（候補から通常ノートとして投稿するフロー）の実装タイミングをユーザーが判断する。

## DB確認コマンド集

```sql
-- 投稿種別の分布（v2確認：no_tl/tl_vibe/tl_mention/quote_renoteの割合）
SELECT generated_reason, COUNT(*) AS cnt
FROM posts
WHERE kind IN ('normal', 'quote_renote')
GROUP BY generated_reason
ORDER BY cnt DESC;

-- 体験候補の蓄積状況
SELECT candidate_type, status, COUNT(*) AS cnt
FROM experience_candidates
GROUP BY candidate_type, status;

-- 引用RN体験ログ
SELECT experience_type, summary, occurred_at
FROM experience_logs
ORDER BY occurred_at DESC LIMIT 10;

-- 許可済みユーザー一覧
SELECT user_id, username, consent_status, consented_at
FROM experience_source_consents
WHERE consent_status = 'consented';

-- source_notes テーブルのサイズ確認（定期的に）
SELECT COUNT(*) AS total,
       MIN(captured_at) AS oldest,
       MAX(captured_at) AS newest
FROM source_notes;

-- 現在の行動ガチャ設定値
SELECT setting_key, setting_value
FROM m_runtime_setting
WHERE category IN ('gacha', 'beta', 'experience_memory', 'timeline')
ORDER BY category, setting_key;
```

## Beta-Test1 モード切り替え

DBマスタを更新してモードを切り替える。再起動不要（最大5分で反映）。

```sql
-- beta-test1 有効化（引用RN 40%、通常ノート経過時間5倍）
UPDATE m_runtime_setting SET setting_value = 'true',  updated_at = datetime('now') WHERE setting_key = 'BETA_TEST1_ENABLED';

-- beta-test1 無効化（通常モードに戻す）
UPDATE m_runtime_setting SET setting_value = 'false', updated_at = datetime('now') WHERE setting_key = 'BETA_TEST1_ENABLED';
```

**beta-test1モードの確率（v2）:**
- 引用RN: 40%（通常モードの2倍）
- 通常ノートの経過時間判定: 実経過時間を5倍として計算（30分経過 → 150分相当で判定）

確認: `docker compose logs -f bot | grep betaTest1`

## 確率の一時調整

再起動不要。変更後、次の5分tickから反映。

```sql
-- 引用RN確率を上げる（例: 50%に）
UPDATE m_runtime_setting SET setting_value = '0.50', updated_at = datetime('now') WHERE setting_key = 'QUOTE_RENOTE_PROBABILITY';

-- TL参照確率を上げる（例: 80%に）
UPDATE m_runtime_setting SET setting_value = '0.80', updated_at = datetime('now') WHERE setting_key = 'TL_REFERENCE_PROBABILITY';

-- 通常モードに戻す
UPDATE m_runtime_setting SET setting_value = '0.20', updated_at = datetime('now') WHERE setting_key = 'QUOTE_RENOTE_PROBABILITY';
UPDATE m_runtime_setting SET setting_value = '0.50', updated_at = datetime('now') WHERE setting_key = 'TL_REFERENCE_PROBABILITY';
```

**v2のガチャ確率キー:**

| 設定キー | 初期値 | 意味 |
|---|---|---|
| `QUOTE_RENOTE_PROBABILITY` | 0.20 | 5分tickで引用RNガチャに入る確率（独立） |
| `TL_REFERENCE_PROBABILITY` | 0.50 | 通常ノート内でTLを参照する確率 |
| `TL_VIBE_RATIO` | 0.75 | TL参照時の雰囲気言及の比率（残り25%が特定言及） |

## Docker常駐確認事項

- `poll.tick` が毎分継続している。
- `postDraw.tick` が5分ごとに出ている。
- `experienceScan.tick` が10分ごとに出ている。
- `scheduledPost.posted` / `quoteRenote.posted` が出ている（または適切なskip理由）。
- `generated_reason` に `no_tl` / `tl_vibe` / `tl_mention` が混在している（偏り確認）。
- `generatePost.memoryDepth` で depth 分布を確認（normal が9割程度）。
- リプライ・`/stop`・`/unfollow` の実機挙動が維持されている。
- ❤リアクションが `experience_source_consents` に反映される。

## AI設定の扱い

- AI secretは `CHUTES_API_KEY` と `OPENAI_API_KEY` のみ `.env.local` に置く。
- 確率・モデルID・タイムアウトなどの非secret設定は `m_runtime_setting` で管理する。
- 設定変更後の再起動は不要。最大5分（次のtick）で反映される。

## P1以降として後から対応してよいもの

- Phase 4: 体験候補からの通常ノート投稿フロー（`experience_candidates` → 投稿 → `experience_logs` 昇格）。
- Phase 5: 体験投稿と記憶化（`experience_logs` 本格活用・`EXPERIENCE_MEMORY_PROMPT_WEIGHT` 調整）。
- Phase 6: rate limit・error backoff・AI日次上限（`NOTES_PER_HOUR` / `NOTES_PER_DAY` の実装）。
- Phase 7: エモーション画像添付。
- Phase 2追加: NoteHintのDBマスタ移行・時間帯重みづけ・連続カテゴリ回避。
- AI設定GUI（管理画面）。
- おはよう / おやすみ / 寝言の確率設計。

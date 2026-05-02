# User Tasks

ユーザーが実際に消化する作業と、作業後に見る確認事項を分ける。

## 今すぐ必要なタスク

- `docker compose up -d --build` を実行してコード変更をコンテナに反映する。
- 反映後にログで新機能の動作確認:
  ```
  docker compose logs -f bot | grep -E "postDraw|tlObservation|quoteRenote|generatePost.memoryDepth|betaTest1"
  ```
- `generatePost.memoryDepth` で depth の分布（normal/reminisce/reference）を確認する。

## 次セッションのP0タスク

- **投稿多様性の確認**: 文体パターン・お題・口調のガチャが機能しているか実際のノートで確認。同じ構成が続くようなら4パターンを増やすか調整する。
- **引用RN実績確認**: `experience_logs` に引用RNのレコードが蓄積されているか確認する。
  ```sql
  SELECT experience_type, summary, occurred_at FROM experience_logs ORDER BY occurred_at DESC LIMIT 10;
  ```
- **beta-test1テスト**: テスター募集前に `BETA_TEST1_ENABLED=true` で動作を手動確認する。
- **Phase 4着手判断**: 体験候補蓄積フロー（`experience_candidates`）の実装可否をユーザーが判断する。

## Beta-Test1 モード切り替え

DBマスタを更新してモードを切り替える。再起動不要。

```sql
-- beta-test1 有効化（TL観測80%、引用RN overall 20%、通常ノート経過時間5倍）
UPDATE m_runtime_setting SET setting_value = 'true',  updated_at = datetime('now') WHERE setting_key = 'BETA_TEST1_ENABLED';

-- beta-test1 無効化（通常モードに戻す）
UPDATE m_runtime_setting SET setting_value = 'false', updated_at = datetime('now') WHERE setting_key = 'BETA_TEST1_ENABLED';
```

反映は最大5分。確認は `docker compose logs -f bot | grep betaTest1`。

## 引用RN確率の一時調整

```sql
-- 例: 全体50%に上げる
UPDATE m_runtime_setting SET setting_value = '1.0',  updated_at = datetime('now') WHERE setting_key = 'TL_OBSERVATION_POST_PROBABILITY';
UPDATE m_runtime_setting SET setting_value = '0.50', updated_at = datetime('now') WHERE setting_key = 'QUOTE_RENOTE_PROBABILITY';

-- 通常に戻す
UPDATE m_runtime_setting SET setting_value = '0.20', updated_at = datetime('now') WHERE setting_key = 'TL_OBSERVATION_POST_PROBABILITY';
UPDATE m_runtime_setting SET setting_value = '0.20', updated_at = datetime('now') WHERE setting_key = 'QUOTE_RENOTE_PROBABILITY';
```

## Docker常駐確認事項

- `poll.tick` が毎分継続している。
- `postDraw.tick` が5分ごとに出ている。
- `scheduledPost.posted` / `tlObservation.posted` / `quoteRenote.posted` が出ている（または適切なskip理由）。
- `generatePost.memoryDepth` で depth 分布を確認（normal が9割程度）。
- リプライ・`/stop`・`/unfollow` の実機挙動が維持されている。
- ❤リアクションが `experience_source_consents` に反映される。

## AI設定の扱い

- AI secretは `CHUTES_API_KEY` と `OPENAI_API_KEY` のみ `.env.local` に置く。
- 確率・モデルID・タイムアウトなどの非secret設定は `m_runtime_setting` で管理する。

## P1以降として後から対応してよいもの

- Phase 3 残: `tl_observations` テーブルへの詳細保存・AI分類記録。
- Phase 4: 体験候補の蓄積フロー（`experience_candidates`）。
- Phase 5: 体験投稿と記憶化（`experience_logs` 本格活用）。
- Phase 6: rate limit・error backoff・AI日次上限。
- Phase 7: エモーション画像添付。
- Phase 2追加: NoteHintのDBマスタ移行・時間帯重みづけ・連続カテゴリ回避。
- AI設定GUI（管理画面）。
- おはよう / おやすみ / 寝言の確率設計。

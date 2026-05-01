# User Tasks

ユーザーが実際に消化する作業と、作業後に見る確認事項を分ける。

## 今すぐ必要なタスク

- `docker compose up -d --build` を実行してコード変更をコンテナに反映する。
- 反映後 `docker compose logs -f bot | grep -E "postDraw|tlScan|tlObservation|quoteRenote"` で新しい行動ガチャが動いているか確認する。

## 次セッションのP0タスク

- **投稿の多様性確認**: 最近の投稿文体が変わったか確認する。まだ偏りがあれば chutes-model-compare でモデル・temperature を調整する。
- **TL観測・引用RNの実動作確認**: `tlObservation.posted` / `quoteRenote.posted` / `quotePick.found` / `quotePick.unsafe` がログに出るか確認する。
- **Phase 4 着手判断**: 体験候補蓄積フロー（`experience_candidates`）の実装可否をユーザーが判断する。
- `public` visibilityを継続するか、`home` visibilityへ戻すか決める。

## Docker常駐確認事項

- `docker compose logs -f bot` で `poll.tick` が継続している。
- `postDraw.tick` が5分ごとに出ている。
- `scheduledPost.posted` または `tlObservation.posted` または `quoteRenote.posted` が出ている（または適切な理由でskip）。
- リプライ、`/stop`、`/unfollow` の実機挙動が維持されている。
- ピン留め同意ノートへの❤が `experience_source_consents` に反映される。
- 異常な連続返信、連続フォロー返し、API errorが出ていない。

## AI設定の扱い

- `.env.local` に登録するAI secretは `CHUTES_API_KEY` と `OPENAI_API_KEY` だけにする。
- 投稿確率、最短投稿間隔、AI provider、model id、timeout、retry、token上限、temperature、日次上限、fallback方針はDBマスタ `m_runtime_setting` で管理する。
- 主な暫定値（`m_runtime_setting` で変更可）:

```sql
SELECT setting_key, setting_value, description
FROM m_runtime_setting
WHERE category IN ('scheduling','timeline','experience','ai')
ORDER BY category, setting_key;
```

## 事前確認事項

- Botフラグが付いている。
- プロフィールまたはピン留めノートに、Bot管理者のmisskey.ioアカウント `@unibell4` が記載されている。
- ピン留め同意ノートが公開され、`PINNED_CONSENT_NOTE_ID` が正しい。
- Misskey tokenに必要権限がある。
- Neon/Postgresの `DATABASE_URL` がローカルDockerから正しいDBを指している。

## P1以降として後から対応してよいもの

- Phase 3 残: `tl_observations` テーブルへの詳細保存・AI分類記録。
- Phase 4: 体験候補の蓄積フロー（`experience_candidates`）。
- Phase 5: 体験投稿と記憶化（`experience_logs`）。
- Phase 6: rate limit・error backoff・AI日次上限。
- Phase 7: エモーション画像添付。
- AI設定GUI（管理画面）。
- おはよう / おやすみ / 寝言の確率設計。

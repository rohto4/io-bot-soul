# User Tasks

ユーザーが実際に消化する作業と、作業後に見る確認事項を分ける。

## 今すぐ必要なタスク

- Docker常駐を `SCHEDULED_POSTING_ENABLED=false` の状態で起動し、`scheduledPost.skip reason=disabled` を確認する。
- `.env.local` がGitに含まれていないことを確認する。

## 次セッションのP0タスク

- **似たような投稿の多様性改善** (chutes-model-compareで実施):
  - systemプロンプトに「直近投稿と異なる書き出し・締め方」を明示する制約を追加する。
  - 過去投稿の文末・書き出しパターンをプロンプトに渡す仕組みを実装する。
  - chutes-model-compareでモデル別の多様性を評価する。
- 生成された実際のノート文を数件確認し、`base-personal.md` とズレる表現を列挙する。
- BOT自認、生活感、Misskey高校・家・図書館・ラボの文脈を、AI promptへどう入れるか決める。
- `public` visibilityを継続するか、`home` visibilityへ戻すか決める。
- Docker常駐側で `poll.tick`、リプライ、`/stop`、`/unfollow`、❤同意確認が維持されることを実機確認する。

## Docker常駐運用タスク

- `.env.local` に `POST_DRAW_INTERVAL_SECONDS=300` を設定する。
- `.env.local` に `SCHEDULED_POSTING_ENABLED=false` を設定した状態で `docker compose up -d --build` を実行する。
- `docker compose logs -f bot` で `poll.tick` と `scheduledPost.skip reason=disabled` を確認する。
- skip確認後、`.env.local` の `SCHEDULED_POSTING_ENABLED=true` に変更する。
- `docker compose restart bot` で反映する。
- 初回投稿はDocker常駐のpost-drawタイマーで行い、直後に二重投稿されないことをログとDBで確認する。

## 初回投稿後のタスク

- 初回投稿直後に、`npm run scheduled:post-draw:prod` または次のDocker post-draw tickで `min_interval` skipになることを確認する。
- 二重投稿されないことを確認したら、Docker常駐をそのまま稼働させる。
- 問題があれば、`.env.local` の `SCHEDULED_POSTING_ENABLED=false` に戻して `docker compose restart bot` を実行する。
- 常駐Docker側で問題があれば `docker compose down` で停止する。

## AI設定の扱い

- `.env.local` に登録するAI secretは `CHUTES_API_KEY` と `OPENAI_API_KEY` だけにする。
- 投稿確率、最短投稿間隔、AI provider、model id、timeout、retry、token上限、temperature、日次上限、fallback方針はDBマスタ `m_runtime_setting` で管理する。
- GitHub repository variablesへ運用調整値を大量登録しない。
- GUIからAI設定を編集できる管理画面はP1/P2で実装する。
- 初期はmigrationでDBへデフォルト値を投入し、必要ならSQLまたは簡易CLIで更新する。

## 事前確認事項

- Botフラグが付いている。
- プロフィールまたはピン留めノートに、Bot管理者のmisskey.ioアカウント `@unibell4` が記載されている。
- プロフィールまたはピン留めノートに、botであること、参照の仕組み、停止方法が書かれている。
- ピン留め同意ノートが公開され、`PINNED_CONSENT_NOTE_ID` が正しい。
- Misskey tokenに必要権限がある。
- Neon/Postgresの `DATABASE_URL` がローカルDockerから正しいDBを指している。
- `DATABASE_URL` のSSL指定は、可能なら `sslmode=verify-full` にしてpgの将来警告を避ける。
- `docs/spec/base-personal.md` の基本画像参照が [CoffeeBean_V1_2_2026-04-30-23-42-08.png](../../images/CoffeeBean_V1_2_2026-04-30-23-42-08.png) になっている。
- `m_runtime_setting` を次のSQLで確認できる。

```sql
SELECT category, setting_key, setting_value, value_type, description
FROM m_runtime_setting
ORDER BY category, setting_key;
```

## 定期投稿確認事項

- `SCHEDULED_POSTING_ENABLED=false` のDocker常駐ログで `scheduledPost.skip` が出る。
- `SCHEDULED_POSTING_ENABLED=true` に変更する直前に、misskey.io上の直近ノートから5分以上空いている。
- 5分以上30分未満の場合は投稿抽選に入るが、確率は低めでskipされることがある。
- 初回投稿はDocker常駐のpost-drawタイマーで行う。
- 初回投稿後、misskey.io上で投稿visibility、文面、連投していないことを確認する。
- 初回投稿後、Neon DBの `posts.note_id`、`posts.visibility`、`posts.generated_reason`、`bot_state.last_note_at` を確認する。
- 初回投稿直後の再実行で、`scheduledPost.skip` / `reason = min_interval` が出る。

## 常駐Docker確認事項

- `docker compose logs -f bot` で `poll.tick` が継続している。
- Docker常駐側では `poll.tick` が毎分出る。定期投稿抽選は `postDraw.tick` と `scheduledPost.*` のログで見る。
- リプライ、`/stop`、`/unfollow` の実機挙動が維持されている。
- ピン留め同意ノートへの❤が `experience_source_consents` に反映される。
- 異常な連続返信、連続フォロー返し、API errorが出ていない。

## P1として後から対応してよいもの

固定テンプレートの定期ノートに限る場合、以下は実投稿ブロッカーではない。

- 投稿文を性格設定にさらに寄せる調整。
- エモーション画像添付。
- AIによる投稿文生成。
- AI設定GUI。
- 体験候補、TL観測、引用Renoteとの接続。
- `m_rate_limit` を使った汎用rate limit実装。
- `m_safety_rule` と不適切語辞書の本格投入。
- おはよう / おやすみ / 寝言などの確率設計。

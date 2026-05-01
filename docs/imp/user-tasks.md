# User Tasks

ユーザーが実際に消化する作業と、作業後に見る確認事項を分ける。

## 今すぐ必要なタスク

- 未commit差分を確認する。
- `npm test` を実行する。
- `npm run build` を実行する。
- `npm run scheduled:post-draw:prod` を `SCHEDULED_POSTING_ENABLED=false` の状態で実行する。
- `.env.local` がGitに含まれていないことを確認する。
- `.env.example` にsecret値が混入していないことを確認する。
- 変更をcommit/pushする。
- GitHub repository secretsに `MISSKEY_TOKEN` を登録する。
- GitHub repository secretsに `PINNED_CONSENT_NOTE_ID` を登録する。
- GitHub repository secretsに `DATABASE_PROVIDER` を登録する。
- GitHub repository secretsに `DATABASE_URL` を登録する。
- GitHub repository secretsに `CHUTES_API_KEY` を登録する。
- GitHub repository secretsに `OPENAI_API_KEY` を登録する。
- 初回skip確認用に、GitHub repository variablesの `SCHEDULED_POSTING_ENABLED=false` を登録する。
- GitHub Actionsを手動実行する。
- skip確認後、GitHub repository variablesの `SCHEDULED_POSTING_ENABLED=true` に変更する。
- 初回投稿をGitHub Actionsの手動実行で行う。

## 初回投稿後のタスク

- 初回投稿直後に、GitHub Actionsをもう一度手動実行する。
- 二重投稿されないことを確認したら、5分scheduleをそのまま稼働させる。
- 問題があれば、GitHub repository variablesの `SCHEDULED_POSTING_ENABLED=false` に戻す。
- 常駐Docker側で問題があれば `docker compose down` で停止する。

## AI設定の扱い

- GitHubに登録するAI secretは `CHUTES_API_KEY` と `OPENAI_API_KEY` だけにする。
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
- Neon/Postgresの `DATABASE_URL` がローカルDockerとGitHub Actionsで同じDBを指している。
- `DATABASE_URL` のSSL指定は、可能なら `sslmode=verify-full` にしてpgの将来警告を避ける。
- `docs/spec/base-personal.md` の基本画像参照が [CoffeeBean_V1_2_2026-04-30-23-42-08.png](../../images/CoffeeBean_V1_2_2026-04-30-23-42-08.png) になっている。
- `m_runtime_setting` を次のSQLで確認できる。

```sql
SELECT category, setting_key, setting_value, value_type, description
FROM m_runtime_setting
ORDER BY category, setting_key;
```

## Actions確認事項

- `SCHEDULED_POSTING_ENABLED=false` の手動実行で `scheduledPost.skip` が出る。
- `SCHEDULED_POSTING_ENABLED=true` に変更する直前に、misskey.io上の直近ノートから5分以上空いている。
- 5分以上30分未満の場合は投稿抽選に入るが、確率は低めでskipされることがある。
- 初回投稿は自動scheduleではなく手動実行で行う。
- 初回投稿後、misskey.io上で投稿visibility、文面、連投していないことを確認する。
- 初回投稿後、Neon DBの `posts.note_id`、`posts.visibility`、`posts.generated_reason`、`bot_state.last_note_at` を確認する。
- 初回投稿直後の再実行で、`scheduledPost.skip` / `reason = min_interval` が出る。

## 常駐Docker確認事項

- `docker compose logs -f bot` で `poll.tick` が継続している。
- `postDraw.tick` が出ても、ローカル側の `SCHEDULED_POSTING_ENABLED` がfalseなら投稿されない。
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

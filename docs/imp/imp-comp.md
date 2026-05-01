# Implementation Complete

## 2026-04-29 初期化

- `AGENTS.md`、`PROJECT.md`、`docs/` 標準構成を作成。
- ECC由来skillとcommandを必要範囲で取り込み。
- `init.md` 冒頭に UTF-8・日本語で進める最優先指示を追記。

## 2026-04-29 性格ベース候補

- `docs/candi-ref/base-personal.md` にノートの性格ベース候補を作成。
- 一人称、口調、リアクション方針、Misskey空間の解釈、興味、距離感、活動時間軸、ノートの締め方などを候補として整理。
- 備考として、投稿抽選、生活リズム、おはよう・おやすみ、睡眠中の寝言に関するBOT仕様候補を追加。
- 性格ベースは一旦候補資料として完了。採用仕様化は未決。

## 2026-05-01 Dockerローカル常駐土台

- Node.js/TypeScriptプロジェクトを作成。
- Dockerfile、compose.yaml、.env.exampleを作成。
- SQLite schema migrationを実装。
- 1分pollingと5分投稿抽選の常駐ループ骨組みを実装。
- JSON形式の標準ログを実装。
- Vitestで設定読み込み、DB migration、常駐ループ、loggerをテスト。
- Dockerイメージのbuildと短時間起動スモークを確認。

## 2026-05-01 Misskey実機確認用probe

- Misskey API clientを実装。
- `i/notifications` によるリプライ・メンション通知取得を実装。
- `notes/create` による定型リプライ投稿を実装。
- `notes/reactions` によるピン留め同意ノートの❤リアクション確認を実装。
- ❤リアクションしたユーザーを `experience_source_consents` に `consented` として保存する処理を実装。
- 定型リプライは重複返信を避け、1回のpollingで最大1件に制限。
- 引用RNや体験候補の前段に置く、許可済みユーザー判定を実装。
- 実DBのドライ実行で、`unibell4` と `nekokitiyorio` のみ許可され、未登録ユーザーは拒否されることを確認。
- フォロー通知を検知し、フォロー返しとピン留め同意ノート案内を行う処理を実装。
- フォロー案内は重複投稿を避け、`consent_guides` に記録する。

## 2026-05-01 ワンショット定期処理

- `post-draw` 用のワンショットCLIを作成。
- `npm run scheduled:post-draw` と `npm run scheduled:post-draw:prod` を追加。
- GitHub Actions workflow `.github/workflows/scheduled-post-draw.yml` を作成。
- 定期ノート投稿は `SCHEDULED_POSTING_ENABLED` で明示的に有効化する方式にした。
- 有効化時は直近通常投稿から `SCHEDULED_POST_MIN_INTERVAL_MINUTES` 分以上空いている場合に投稿抽選へ入る。
- 投稿確率は経過時間で上がり、目安は5分後10%、10分後15%、30分後80%、1時間超95%。
- `SCHEDULED_POST_MIN_INTERVAL_MINUTES` と投稿確率はDBマスタ `m_runtime_setting` へ移した。
- リプライ・フォロー・リアクション監視の処理上限も `m_runtime_setting` へ移した。
- 投稿成功時は `posts` に `kind = normal`、`generated_reason = scheduled_post_draw_v0` で記録し、`bot_state.last_note_at` を更新する。
- workflowは5分ごとのscheduleと手動実行に対応。
- 現時点の投稿文はAI生成や体験候補参照を行わない固定テンプレートで、体験候補選定と引用Renote連携は未実装。

## 2026-05-01 Neon/Postgres移行土台

- DB操作をSQLite直結から共通 `DbClient` へ移行。
- `DATABASE_PROVIDER=sqlite|postgres` で接続先を切り替える構成に変更。
- Neon用に `pg` を追加。
- Postgres用schema変換を追加し、`AUTOINCREMENT` をidentity columnへ変換。
- GitHub Actions workflowで `DATABASE_PROVIDER` と `DATABASE_URL` を読むように変更。

## 2026-05-01 AI provider方針と疎通確認

- AI生成・分類はChutesをprimary、OpenAIをfallbackにする方針を確定。
- `.env.example` とGitHub Actions workflowには `CHUTES_API_KEY`、`OPENAI_API_KEY` のsecretだけを追加。
- AI provider、model id、使用量上限、失敗時挙動などの非secret設定はDBマスタ `m_runtime_setting` で管理する方針に変更。
- `m_runtime_setting` テーブルと初期値seedを追加。
- Chutes API keyの疎通を確認。
- Chutes `/models` の取得を確認。
- Chutesの正式model idは `moonshotai/Kimi-K2.5-TEE` と確認。
- Chutes `chat/completions` で `moonshotai/Kimi-K2.5-TEE` の疎通を確認。
- OpenAI API keyの疎通を確認。
- OpenAI `gpt-5.4-mini` の疎通を確認。
- Chutesは `max_tokens`、OpenAI `gpt-5.4-mini` は `max_completion_tokens` が必要と確認。
- Chutes Kimiは内部推論で `reasoning_tokens` を消費し、token上限が小さいと `content = null` になることを確認。

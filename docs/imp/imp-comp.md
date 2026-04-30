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
- workflowは30分ごとのscheduleと手動実行に対応。
- 現時点では投稿生成本体が未実装のため、`post-draw` はDB状態更新とログ出力までを行う。

## 2026-05-01 Neon/Postgres移行土台

- DB操作をSQLite直結から共通 `DbClient` へ移行。
- `DATABASE_PROVIDER=sqlite|postgres` で接続先を切り替える構成に変更。
- Neon用に `pg` を追加。
- Postgres用schema変換を追加し、`AUTOINCREMENT` をidentity columnへ変換。
- GitHub Actions workflowで `DATABASE_PROVIDER` と `DATABASE_URL` を読むように変更。

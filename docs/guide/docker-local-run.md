# Dockerローカル常駐ガイド

## 目的

このPJのbotは、初期段階ではユーザーPC上で常駐させる。
起動方法はDocker Composeを採用し、Windowsのタスクスケジューラーや手動起動に依存しすぎない形にする。

## 採用方針

- Docker Composeでbotプロセスを1サービスとして起動する。
- SQLite DB、ログ、画像素材はホスト側ディレクトリをマウントする。
- Misskey tokenなどのsecretは `.env.local` に置き、Gitには入れない。
- `restart: unless-stopped` を使い、Docker Desktop起動後に自動復旧しやすくする。
- MVPのDocker常駐プロセスは1分pollingで通知、リプライ、フォロー、リアクションを確認する。
- 5分ごとの投稿抽選も同じDocker常駐プロセスで実行する。
- Streaming APIは安定化後の改善候補に回す。

## 想定ディレクトリ

```text
.
├─ compose.yaml
├─ Dockerfile
├─ .env.local
├─ .env.example
├─ package.json
├─ src/
├─ data/
│  └─ bot.sqlite
├─ logs/
└─ images/
```

## `.env.local` の想定

```dotenv
MISSKEY_HOST=https://misskey.io
MISSKEY_TOKEN=
PINNED_CONSENT_NOTE_ID=
ADMIN_ACCOUNT=@unibell4
DATABASE_PROVIDER=postgres
DATABASE_URL=
SQLITE_PATH=/app/data/bot.sqlite
POLL_INTERVAL_SECONDS=60
POST_DRAW_INTERVAL_SECONDS=300
SCHEDULED_POSTING_ENABLED=false
CHUTES_API_KEY=
OPENAI_API_KEY=
```

投稿確率、最短投稿間隔、AIのmodel id、timeout、token上限、fallback方針などの非secret設定はDBマスタ `m_runtime_setting` で管理する。

## `compose.yaml` の想定

```yaml
services:
  bot:
    build: .
    container_name: io-bot-soul
    restart: unless-stopped
    env_file:
      - .env.local
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./images:/app/images:ro
```

## 基本コマンド

```powershell
docker compose build
docker compose up -d
docker compose logs -f bot
docker compose restart bot
docker compose down
```

## ワンショット定期処理

常駐プロセスとは別に、確認用として1回だけ定期処理を実行して終了する入口も残す。

```powershell
npm run scheduled:post-draw
docker compose run --rm bot node dist/scheduled.js post-draw
```

`post-draw` は投稿抽選用の入口で、`SCHEDULED_POSTING_ENABLED=true` のときだけ通常ノートを作成する。
初期値は `false` のため、設定を有効化するまではDB更新とskipログのみを行う。
Docker常駐では `POST_DRAW_INTERVAL_SECONDS=300` を既定値として、5分ごとに同じ投稿抽選を行う。

## 定期ノートの有効化

Docker常駐で定期ノートを投稿する場合は、`.env.local` に次を設定してコンテナを再起動する。

```text
SCHEDULED_POSTING_ENABLED=true
```

`SCHEDULED_POSTING_ENABLED` が `false` または未設定の場合、post-drawタイマーは動いてもノート投稿は行わない。
`SCHEDULED_POST_MIN_INTERVAL_MINUTES` はDBマスタ `m_runtime_setting` で、DB上の直近の通常投稿から最低何分空けるかを決める。
5分未満は必ずskipし、5分以上は投稿抽選に入る。
投稿確率は直近通常投稿からの経過時間で上がり、目安は5分後10%、10分後15%、30分後80%、1時間超95%。
初期実装の定期ノートは `public` visibilityで投稿し、`posts.kind = normal`、`generated_reason = scheduled_post_draw_v0` として記録する。

現在の運用値は次のSQLで確認する。

```sql
SELECT category, setting_key, setting_value, value_type, description
FROM m_runtime_setting
ORDER BY category, setting_key;
```

## 初回起動までの流れ

1. Node.js/TypeScriptプロジェクトを作成する。
2. `Dockerfile` と `compose.yaml` を作成する。
3. `.env.example` を作成し、実際の `.env.local` はローカルだけに置く。
4. SQLite migrationを実行できるようにする。
5. `docker compose build` でイメージを作る。
6. `docker compose up -d` で常駐起動する。
7. `docker compose logs -f bot` で疎通、polling、返信、フォロー、同意確認ログを見る。

## 運用上の注意

- `.env.local`、SQLite DB、ログはGitに入れない。
- Docker Desktopが停止している間、botは動かない。
- Windows再起動後にDocker Desktopが自動起動する設定を確認する。
- 投稿、返信、skip理由、API error、rate limit、再起動復旧はログへ出す。
- Botフラグ、管理者アカウント表記、ピン留め同意ノート、レート制限、不適切語フィルタは公開前に必ず確認する。

## n8nとの比較

n8nはワークフロー管理には強いが、このPJではキャラクター記憶、投稿生成、安全判定、DB更新、Misskey API処理が密接に結びつく。
初期実装ではDocker Compose上の単一botプロセスの方が、状態管理とテストが単純になる。

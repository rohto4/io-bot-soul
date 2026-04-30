# User Tasks

## Docker常駐起動までの手元準備

- Docker Desktopを起動する。
- Docker DesktopがWindows起動時に自動起動する設定になっているか確認する。
- `docker --version` と `docker compose version` が実行できることを確認する。
- `.env.example` をコピーして `.env.local` を作成する。
- `.env.local` に `MISSKEY_TOKEN` を設定する。
- 初回の実機疎通前は、必要に応じて `PINNED_CONSENT_NOTE_ID` を空のままにする。
- `docker compose build` を実行する。
- `docker compose up -d` を実行する。
- `docker compose logs -f bot` で `bot.start`、`poll.tick`、`postDraw.tick` が出ることを確認する。
- 停止したい場合は `docker compose down` を実行する。

## misskey.ioアカウント準備

- bot用アカウントを作成する。
- botであることが分かるプロフィールにする。
- API tokenを発行する。
- tokenの権限範囲を確認する。
- tokenは `.env` などローカルsecretに保存し、Gitには入れない。

## プロフィール・ピン留めノート

- プロフィールに、botであること、投稿を参考にする仕組み、オプトアウト方法を書く。
- ピン留めノートに、許可条件、対象外にする内容、引用する場合があること、取り消し方法を書く。
- 文面は実装前に最終確認する。

## 運用判断

- 引用Renoteをどの頻度まで許容するか決める。
- 体験候補にしてよい投稿ジャンルを決める。
- 絶対に扱わない話題を決める。

## GitHub Actions定期実行の準備

- GitHub repository secretsに `MISSKEY_TOKEN` を登録する。
- GitHub repository secretsに `PINNED_CONSENT_NOTE_ID` を登録する。
- GitHub repository secretsに `DATABASE_PROVIDER` を登録する。
- GitHub repository secretsに `DATABASE_URL` を登録する。
- 必要ならGitHub repository variablesに `ADMIN_ACCOUNT` を登録する。
- `.github/workflows/scheduled-post-draw.yml` を有効化して、Actions上で手動実行できることを確認する。
- Neon/Postgresを使う場合、ローカルDockerとGitHub Actionsの両方に同じ `DATABASE_URL` を設定する。

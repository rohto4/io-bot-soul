# Tech Stack

注: ファイル名はユーザー指定に合わせて `teck-stack.md` とする。

## 参照ルール

このPJでmisskey.io botの実行環境、常駐方式、スケジューリング、Misskey API / Streaming APIに関する判断を行う場合は、必ずこのファイルを参照する。

新しい参考資料やリンクを確認した場合は、このファイルに追記してから判断に使う。

## 2026-04-29 時点の初期判断

### 結論

- GitHub Actionsだけでも、定期投稿・定期チェック型のbotなら開始できる。
- misskey.io上で常時オンライン表示を狙う、またはリアルタイム返信・通知監視をするなら、GitHub ActionsやVercel Functionsだけでは不向き。
- 常駐botにする場合は、WebSocketを維持できる常時実行環境を別途用意するのが自然。

### 候補

1. GitHub Actions
   - 定期実行、手動実行、CI/CD、軽いバッチ投稿向き。
   - 常駐WebSocketには不向き。
2. Vercel Cron + Vercel Functions
   - HTTP endpointを定期的に叩く用途向き。
   - 関数実行時間の上限があるため、常時接続botには不向き。
3. 常時実行環境
   - WebSocket接続を維持するbot本体向き。
   - 候補: VPS、Fly.io、Render worker、Railway、Cloud Run jobs/services、self-hosted runnerなど。

## 参考リンク

- Misskey API overview: https://misskey-hub.net/en/docs/for-developers/api/
  - Misskey APIはbotなどのapplication開発に使える。
  - Streaming APIによりリアルタイムapplicationを作れる。
- Misskey Reactions: https://misskey-hub.net/en/docs/for-users/features/reaction/
  - 投稿時に受け付けるリアクション種別を制限できる。
  - `Likes only` により❤のみ受け付けられる。
- Misskey Streaming API: https://misskey-hub.net/en/docs/for-developers/api/streaming/
  - Streaming APIはMisskeyサーバーへWebSocket接続する。
  - 接続URL形式は `wss://{host}/streaming?i={token}`。
  - タイムラインや通知などのイベントを受けるには、WebSocket接続後にchannelへ接続する。
- misskey.io API docs: https://api-doc.misskey.io/
  - `notes/create`、`i/notifications`、`notes/mentions` などのendpoint確認に使う。
- misskey.io `notes/create`: https://api-doc.misskey.io/api-7254018
  - `notes/create` は `write:notes` permissionが必要。
  - noteレスポンスに `reactionAcceptance` が存在する。
- misskey.io `i/notifications`: https://api-doc.misskey.io/api-7253978
  - `read:notifications` permissionが必要。
  - 通知、リプライ、リアクション確認の初期pollingに使う。
- misskey.io `notes/reactions`: https://api-doc.misskey.io/api-7254030
  - noteに付いたリアクション一覧の取得に使う。
  - ピン留め同意ノートへの❤確認に使う。
- Misskey access token docs: https://misskey-hub.net/en/docs/for-developers/api/token/
  - API tokenはJSON bodyの `i` として渡す。
- GitHub Actions limits: https://docs.github.com/en/enterprise-cloud@latest/actions/reference/limits
  - GitHub-hosted runnerのjob実行時間は最大6時間。
  - self-hosted runnerのjob実行時間は最大5日。
- GitHub Actions checkout: https://github.com/actions/checkout
  - workflow上でrepositoryをcheckoutする公式Action。
  - `v6` はNode 24 runtime対応版として参照する。
- GitHub Actions setup-node: https://github.com/actions/setup-node
  - workflow上でNode.js環境を用意する公式Action。
  - `v6` はNode 24 runtime対応版として参照する。
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
  - Vercel Functionsには実行時間上限がある。
  - Hobbyは最大300秒、Pro/Enterpriseは最大800秒。
- Vercel maximum duration config: https://vercel.com/docs/functions/configuring-functions/duration
  - `maxDuration` で関数ごとの実行時間上限を設定できる。
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
  - CronはVercel FunctionsへのHTTP GETで実行される。
  - Cron式のtimezoneはUTC。
- Vercel Managing Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
  - `CRON_SECRET` による保護が推奨される。
  - Cronのduration limitはVercel Functionsと同じ。
  - 重複実行や並行実行に備えてlockと冪等性が必要。
  - HobbyのCronは1日1回まで、指定時刻の時間内のどこかで起動される。
- Misskey.io Terms: https://support.misskey.io/hc/ja/articles/6564530842767-%E5%88%A9%E7%94%A8%E8%A6%8F%E7%B4%84
  - 自動投稿が主となるBotはBotフラグが必要。
  - Bot管理者のmisskey.ioアカウントを概要欄またはピン留めなどに記載する必要がある。
  - ユーザー操作によりリプライや公開投稿を行うBotは、レートリミットと不適切語フィルタが必要。
  - 連続した公開投稿でタイムラインを埋めないこと。

## 未決事項

- 常時オンライン表示がMisskey上でどの条件により維持されるか。
- botが必要とするリアルタイム性。
- 投稿頻度、返信頻度、通知監視の要否。
- DBや永続状態の要否。
- デプロイ先の無料枠、有料許容、運用負荷。

## 2026-04-29 追記: リアルタイム性とローカル常駐前提

### ユーザー前提

- 10秒間隔でリプライの有無をチェックする機能と、30分に1回の投稿時だけ起動する機能で、月額500円程度のような明確なコスト差が出ないなら前者を優先したい。
- ユーザーのPCは常時起動しているため、そのPCをホストとしてbotを動かし続けられる見込みがある。

### 判断

- 常時起動PCを使えるなら、10秒間隔pollingまたはStreaming API常時接続の実験は現実的。
- GitHub ActionsやVercel Functionsで10秒間隔pollingを行うのは不向き。実行回数、実行時間、スケジューラ精度、規約上の使い方の面で無理が出やすい。
- ローカルPC常駐ならクラウド利用料は基本的に増えないが、PCの電気代、再起動時の復旧、ネットワーク断、secret管理、ログ管理は自前で見る必要がある。
- 10秒間隔pollingより、Misskey Streaming APIでWebSocket接続を維持してイベントを受ける方が、実装できるなら自然。pollingはMVPまたはfallbackとして扱う。
- ただしMVPでは実装を単純にするため、1分pollingを採用する。Streaming APIは改善候補に回す。

### 推奨する段階

1. ローカルPC上で常駐botを動かす。
2. まずは5分間隔の投稿抽選 + 1分間隔の通知/リプライ/リアクション確認で実験する。
3. 安定したらStreaming APIへ移行し、pollingはfallbackにする。
4. 外部公開や高可用性が必要になったら、VPS / worker系PaaSへ移す。

### ローカル常駐で必要な設計

- プロセス監視: 落ちたら自動再起動する。
- 起動方法: 初期採用はDocker Desktop + Docker Compose。タスクスケジューラ、サービス化、pm2は代替候補に回す。
- secret管理: `.env` はローカルに置き、Gitには入れない。
- 状態管理: 最後に処理したnotification/note idを保存し、再起動後の重複返信を避ける。
- rate limit対策: polling間隔、最大処理件数、バックオフ、重複防止を持つ。
- misskey.io規約対策: Botフラグ、管理者アカウント明記、レートリミット、不適切語フィルタ、連続投稿回避を持つ。
- ログ: 投稿、返信、skip理由、API error、再接続を記録する。

## 2026-05-01 追記: Dockerローカル常駐採用

### 判断

- ユーザーPC上の常駐方式はDocker Composeを採用する。
- タスクスケジューラー単体より、環境再現性、起動手順、将来のVPS移行が整理しやすい。
- n8nはワークフロー管理には使えるが、このPJの初期実装ではDB更新、記憶、安全判定、投稿生成が密接なため、単一botプロセスの方が扱いやすい。

### 運用方針

- `compose.yaml` でbotサービスを定義する。
- SQLite DB、ログ、画像素材はホスト側ディレクトリをマウントする。
- `restart: unless-stopped` により、Docker Desktop起動後の復旧を狙う。
- `.env` はGitに入れず、Misskey tokenやピン留め同意ノートIDを保持する。
- 詳細手順は [Dockerローカル常駐ガイド](../guide/docker-local-run.md) を参照する。

## 2026-04-29 追記: DB利用方針

### ユーザー前提

- DBは必要。
- soulで性格を決めるだけでなく、misskey.io上の投稿や、キャラクターが疑似的に生活で体験したことを記録したい。
- タイムラインや設定ファイルとは別の場所に、体験ログを永続化する必要がある。
- 30分間隔の別バッチで、タイムラインからランダムまたは別途定める法則に従って元ノートを拾い、体験候補として扱う。
- 実際にノートしたものだけを、キャラクターが体験したこととして扱う。
- 体験ログは後続投稿に反映する。

### 判断

- ローカルPC常駐を前提にするなら、初期DBはSQLiteが最も扱いやすい。
- SQLiteは単一ファイルで運用でき、ローカルbotの記憶、処理済みID、疑似生活ログ、投稿履歴の保存に向く。
- 将来クラウド常駐へ移す場合は、PostgreSQL系に移行できるよう、DBアクセス層を薄く分離しておく。

### 初期DB候補

1. SQLite
   - 初期推奨だったが、GitHub Actionsとローカル常駐の状態共有には向かない。
   - 現在はテストとfallback用に残す。
2. PostgreSQL
   - NeonDBで採用。
   - ローカルDocker常駐とGitHub Actionsの共有DBとして使う。
   - 複数実行元から、処理済み通知、同意状態、投稿履歴、体験ログを共有できる。
3. JSONファイル
   - 一時試作には使えるが、疑似生活ログや重複防止を扱うなら早期にSQLiteへ移す。

## 2026-05-01 追記: Neon/Postgres採用

### 判断

- ローカルDocker常駐プロセスとGitHub Actionsの両方から同じ状態を参照するため、NeonDBを採用する。
- 接続は `DATABASE_PROVIDER=postgres` と `DATABASE_URL` で制御する。
- SQLiteはローカルfallbackとテスト用に残す。

### 注意

- GitHub Actions secretsには `DATABASE_PROVIDER`、`DATABASE_URL`、`MISSKEY_TOKEN`、`PINNED_CONSENT_NOTE_ID` を登録する。
- 定期ノート投稿は、GitHub Actions variablesの `SCHEDULED_POSTING_ENABLED=true` で明示的に有効化する。
- 初期状態では `false` とし、手動実行でskipログを確認してから有効化する。
- Actionsの公式ActionはNode 20 runtime deprecation warningを避けるため、`actions/checkout@v6` と `actions/setup-node@v6` を使う。
- Neonの接続文字列はpooled connection stringを優先する。
- `pg` が `sslmode=require` に対して将来挙動変更予定の警告を出す。現時点では接続・migration・常駐pollingは成功している。

### 初期テーブル候補

- `notes_seen`: 取得済み・処理済みMisskey note id。
- `notifications_seen`: 処理済みnotification id。
- `experience_logs`: キャラクターが疑似的に体験した出来事。
- `experience_candidates`: ノート前の体験候補。
- `tl_observations`: 個人を特定しないTL観測。
- `posts`: bot自身の投稿履歴。
- `reply_logs`: bot自身の返信履歴。
- `source_notes`: 疑似体験の元にした外部noteの最小限メタデータ。
- `memory_atoms`: 継続的に参照する短い記憶単位。

### 注意

- 他者の投稿本文を長期保存・再利用する場合は、引用、要約、公開範囲、削除済み投稿への追従に注意する。
- 体験ログは「元ノートをコピーする」のではなく、「キャラクターが受け取った刺激や出来事として抽象化する」方針が安全。
- 投稿生成時は、元ノートの個人情報や文面をそのまま再出力しない。

## 2026-05-01 追記: AI provider設定

### 判断

- AI生成・分類は、Chutesをprimary、OpenAIをfallbackとして扱う。
- OpenAI fallbackは従量課金API keyを使い、Chutes失敗時の「絶対死守ライン」とする。
- API keyは `.env.local` とGitHub Actions secretsに置き、Gitには入れない。
- model id、base URL、timeout、retry、token上限、temperature、日次fallback上限などはDBマスタで管理する。
- GitHub Actions variablesにはAI設定値を大量登録しない。
- 初期はmigrationでDBへデフォルト値を投入し、P1/P2でGUI編集に対応する。

### 疎通確認結果

- ChutesのAPI keyは有効。
- Chutesの `/models` は取得可能。
- Chutesの `moonshotai/Kimi-K2.5-TEE` は `chat/completions` で疎通成功。
- `Kimi-K2.5-TEE` だけではChutesのmodel idとして不正。正式IDは `moonshotai/Kimi-K2.5-TEE`。
- OpenAIのAPI keyは有効。
- OpenAIの `gpt-5.4-mini` は `chat/completions` で疎通成功。

### 実装上の注意

- ChutesのKimi系モデルは、レスポンスの `usage.reasoning_tokens` と `message.reasoning_content` / `message.reasoning` に内部推論が出ることがある。
- この `reasoning_tokens` は、こちらが明示的に有効化した設定ではなく、モデルがcompletion側で内部推論として消費するトークン。
- `max_tokens` が小さいと、内部推論だけで上限に達し、`message.content` が `null` のまま `finish_reason = length` になることがある。
- Chutes Kimiの分類・短文生成でも、初期値は `max_tokens = 256` 以上を使う。
- Chutesは `max_tokens` を使う。
- OpenAIの `gpt-5.4-mini` は `max_tokens` ではなく `max_completion_tokens` を使う。
- AI client実装では、providerごとにtoken上限パラメータ名を切り替える。
- `message.content` が空、`null`、JSON parse不能、または `finish_reason = length` の場合は、そのproviderの応答を失敗扱いにしてfallbackする。
- `message.reasoning_content` はログや投稿文には使わない。

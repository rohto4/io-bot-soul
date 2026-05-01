# Implementation Wait

未解決の問題、または実装確定だが具体化が残っている項目を置く。

実装候補として整理できたものは `docs/candi-ref/` に移す。

## 実装前ブロッカー

- misskey.io BotアカウントのAPI tokenを用意する。
- ピン留め同意ノートを作成し、note idを設定値として用意する。
- Botフラグを付ける。
- 管理者アカウント `@unibell4` をプロフィールまたはピン留めノートに明記する。

## Misskey API / 実機確認

- `notes/create` で❤のみリアクション受付を指定する具体的な値。
  - MVPでは、同意ピン留めノートを手動作成するなら実装ブロッカーではない。
- ピン留めノートへの❤リアクションを1分pollingで安定して検知できるか。
  - 実装は `notes/reactions` で作成済み。実機確認待ち。
- 通知、リプライ、フォロー、リアクションをどのAPI endpointで取得するか。
  - リプライ・メンション通知は `i/notifications` で実装済み。
  - ピン留め同意ノートのリアクションは `notes/reactions` で実装済み。
  - フォロー通知は `i/notifications` の `follow` で実装済み。実機確認待ち。

## 投稿スケジューリング

- 30分周期の体験候補収集と、5分抽選投稿をどう接続するか。
- おはよう / おやすみ確率の具体式。
- 寝言を月2回程度にする確率設計。
- 寝言の内容の安全範囲。

## AI provider・人格チューニング

- 現行のChutes primary / OpenAI fallbackのAI clientを実投稿向けにチューニングする。
- `base-personal.md` の人格・口調・自認が、生成文に自然に反映されているか実投稿前に確認する。
- BOT自認は「必要な時はAIと認めるが、通常ノートでは人間として生活しているように振る舞う」へ寄せる。
- 投稿文に「生活ログ」だけが過剰に出ないよう、文脈語彙と話題の分散を調整する。
- 過去投稿履歴を参照する際、同じ表現や同じ締め方が連続しないようにする。
- `public` visibilityでよいか、`home` visibilityへ戻すかを運用前に判断する。
- `.env.local` とGitHub Actionsで次のsecretを設定する。
  - `CHUTES_API_KEY`
  - `OPENAI_API_KEY`
- AI設定値はGitHub Actions variablesではなくDBマスタで管理する。
- 運用調整値は `m_runtime_setting` に集約済み。
- AI provider設定の初期値は `m_runtime_setting` へseed済み。
- P1/P2でAI設定をGUIから編集できる管理画面を作る。
- Chutesは `max_tokens`、OpenAI `gpt-5.4-mini` は `max_completion_tokens` を使う。
- Chutes Kimiは内部推論で `reasoning_tokens` を消費するため、分類でも `max_tokens=256` 以上を初期値にする。
- `content` が空、`null`、JSON parse不能、または `finish_reason = length` の場合は、そのproviderの応答を失敗扱いにする。
- fallbackまで失敗した場合は投稿しない。
- prompt全文とreasoning本文はログに残さない。

## GitHub ActionsからローカルDockerへの移行

- 5分ごとの投稿抽選をGitHub ActionsからローカルDockerへ移すか、常駐pollとは別サービスにするか決める。
- 推奨は、Docker Compose内に `bot` と `post-draw` を分ける方式。
  - `bot`: 毎分polling、返信、フォロー案内、同意確認。
  - `post-draw`: 5分ごとの通常ノート投稿抽選。
- 同一プロセス内timerに戻す場合は、pollと投稿抽選の重複実行ガード、停止方法、ログ分離を再設計する。
- 移行後も `SCHEDULED_POSTING_ENABLED` 相当の安全スイッチを残す。
- Actions側のworkflowを停止するタイミングを決める。Docker側と二重起動しないこと。
- ローカルDocker側で5分投稿抽選を動かす場合、PC停止・Docker停止時は投稿されない前提を運用に明記する。

## マスタ定義

- `m_safety_rule` の初期ルールを、実装用の辞書・正規表現・AI分類カテゴリへ落とす。
  - CW
  - NSFW
  - 個人情報
  - 病気
  - 事故
  - 揉め事
  - 政治
  - 医療
  - 投資
  - 成人向け
  - 攻撃的内容
- 不適切語フィルタの初期辞書。
  - 初期実装はお任せ。
  - 運用後にユーザーが添削する。
- `m_emotion_asset` の初期ラベル。
  - 各画像のemotion。
  - 各画像のpost kind。
  - cooldown時間。
  - GIFの使用頻度。

## TL観測・体験候補

- 許可済みユーザーが見つからない時の最大10回探索を、Phase 2以降で入れるか。
- TL観測に使う20ノートから「特定の話題に偏っている」と判定するAI prompt。
- 体験候補を弾くブラックリスト方式のAI prompt。
- 他者note本文をDBに残す要約粒度。

## 引用Renote

- 引用Renoteを使わず抽象化だけに留める条件を、完全ランダムだけでよいか。

## キャラクター設計

- 許可依頼文と体験投稿文を、実働テストで調整する。
- 容姿概要の裏設定を決める。

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

## AI生成投稿の多様性（似たような投稿ばかりになる問題）

- **症状**: 異なる時間帯に投稿された複数のノートが、文頭・文末・構文パターンがほぼ同じになる。
  - 例: 「深夜のTL、〜。こういう時間は、〜。私えらいので、今日の〜もちゃんと残しておく。」が3連続で発生。
- **原因候補**:
  - systemプロンプトが表現の多様性を指示していない。
  - 過去投稿履歴を参照しているが、「直近と同じ構文・締め方を避ける」制約が入っていない。
  - モデル（Chutes Kimi等）が特定の文パターンに収束しやすい傾向を持つ可能性。
- **対処方針** (chutes-model-compareで評価・改善予定):
  - systemプロンプトに「直近3〜5件の投稿と異なる書き出し・締め方を使うこと」を明示する。
  - 過去投稿の文末・書き出しパターンをプロンプトに渡し、それと重複しないよう指示する。
  - モデルの多様性をchutes-model-compareで比較評価する。
- **ブロッカー**: 実投稿中であれば見た目の問題。致命的ではないがキャラクター品質に直結する。

## AI provider・人格チューニング

- 現行のChutes primary / OpenAI fallbackのAI clientを実投稿向けにチューニングする。
- `base-personal.md` の人格・口調・自認が、生成文に自然に反映されているか実投稿前に確認する。
- BOT自認は「必要な時はAIと認めるが、通常ノートでは人間として生活しているように振る舞う」へ寄せる。
- 投稿文に「生活ログ」だけが過剰に出ないよう、文脈語彙と話題の分散を調整する。
- 過去投稿履歴を参照する際、同じ表現や同じ締め方が連続しないようにする。
- `public` visibilityでよいか、`home` visibilityへ戻すかを運用前に判断する。
- `.env.local` で次のsecretを設定する。
  - `CHUTES_API_KEY`
  - `OPENAI_API_KEY`
- AI設定値は環境変数や外部scheduler variablesではなくDBマスタで管理する。
- 運用調整値は `m_runtime_setting` に集約済み。
- AI provider設定の初期値は `m_runtime_setting` へseed済み。
- P1/P2でAI設定をGUIから編集できる管理画面を作る。
- Chutesは `max_tokens`、OpenAI `gpt-5.4-mini` は `max_completion_tokens` を使う。
- Chutes Kimiは内部推論で `reasoning_tokens` を消費するため、分類でも `max_tokens=256` 以上を初期値にする。
- `content` が空、`null`、JSON parse不能、または `finish_reason = length` の場合は、そのproviderの応答を失敗扱いにする。
- fallbackまで失敗した場合は投稿しない。
- prompt全文とreasoning本文はログに残さない。

## ローカルDocker常駐

- 採用: 単一のDocker常駐 `bot` プロセス内で、毎分pollingと5分ごとの通常ノート投稿抽選を両方実行する。
  - polling: `POLL_INTERVAL_SECONDS`
  - post-draw: `POST_DRAW_INTERVAL_SECONDS`
- pollと投稿抽選は、それぞれ重複実行ガードを持つ。
- `SCHEDULED_POSTING_ENABLED` を最終安全スイッチとして残す。
- GitHub Actionsの定期投稿workflowは停止済み。Docker側と二重起動しないこと。
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

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
- 直前ノートからの経過時間に応じた確率曲線の具体式。
- おはよう / おやすみ確率の具体式。
- 寝言を月2回程度にする確率設計。
- 寝言の内容の安全範囲。

## AI provider実装

- Chutes primary / OpenAI fallbackのAI clientを実装する。
- `.env.local` とGitHub Actionsで次のsecretを設定する。
  - `CHUTES_API_KEY`
  - `OPENAI_API_KEY`
- AI設定値はGitHub Actions variablesではなくDBマスタで管理する。
- `m_ai_setting` または同等のAI設定マスタを追加する。
- 初期値として次をDBへ投入する。
  - `AI_PRIMARY_PROVIDER=chutes`
  - `AI_FALLBACK_PROVIDER=openai`
  - `AI_FALLBACK_ENABLED=true`
  - `CHUTES_BASE_URL=https://llm.chutes.ai/v1`
  - `CHUTES_MODEL_TEXT=moonshotai/Kimi-K2.5-TEE`
  - `CHUTES_MODEL_CLASSIFIER=moonshotai/Kimi-K2.5-TEE`
  - `CHUTES_TIMEOUT_MS=30000`
  - `CHUTES_MAX_RETRIES=1`
  - `OPENAI_BASE_URL=https://api.openai.com/v1`
  - `OPENAI_MODEL_TEXT=gpt-5.4-mini`
  - `OPENAI_MODEL_CLASSIFIER=gpt-5.4-mini`
  - `OPENAI_TIMEOUT_MS=30000`
  - `OPENAI_MAX_RETRIES=1`
  - `AI_DAILY_MAX_REQUESTS=200`
  - `AI_DAILY_MAX_FALLBACK_REQUESTS=30`
  - `AI_POST_GENERATION_MAX_TOKENS=600`
  - `AI_CLASSIFIER_MAX_TOKENS=300`
  - `AI_TEMPERATURE_TEXT=0.8`
  - `AI_TEMPERATURE_CLASSIFIER=0.0`
  - `AI_REQUIRE_CLASSIFIER_PASS=true`
  - `AI_SKIP_POST_ON_AI_FAILURE=true`
  - `AI_SKIP_POST_ON_FALLBACK_FAILURE=true`
  - `AI_LOG_PROMPT=false`
  - `AI_LOG_RESPONSE_SUMMARY=true`
- P1/P2でAI設定をGUIから編集できる管理画面を作る。
- Chutesは `max_tokens`、OpenAI `gpt-5.4-mini` は `max_completion_tokens` を使う。
- Chutes Kimiは内部推論で `reasoning_tokens` を消費するため、分類でも `max_tokens=256` 以上を初期値にする。
- `content` が空、`null`、JSON parse不能、または `finish_reason = length` の場合は、そのproviderの応答を失敗扱いにする。
- fallbackまで失敗した場合は投稿しない。
- prompt全文とreasoning本文はログに残さない。

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

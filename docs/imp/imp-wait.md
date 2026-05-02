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

## AI生成投稿の多様性

- 多様性ルール・直前パターン提示・tiered記憶参照は2026-05-02に実装済み。
- **残課題** (chutes-model-compareで評価予定):
  - モデルごとの多様性をベンチマーク比較する。
  - temperatureや表現ジャンルの指示をさらに調整する。

## AI provider・人格チューニング

- Chutes primary / OpenAI fallbackは実装済み。character-spec.ts / chat-api.tsで共通化済み。
- `base-personal.md` の人格・口調が生成文に反映されているか運用しながら確認する。
- BOT自認（通常ノートでは人間として振る舞う）のprompt反映は継続調整中。
- `public` visibilityを継続するか `home` に戻すかは運用判断。
- P1/P2でAI設定をGUIから編集できる管理画面を作る。

## TL観測・行動ガチャの暫定値（Phase 3 MVP）

以下は暫定実装した設定値。実投稿の様子を見てDBマスタ（`m_runtime_setting`）で調整する。

| 設定キー | 暫定値 | 意味 | 変更の目安 |
|---|---|---|---|
| `TL_OBSERVATION_POST_PROBABILITY` | 0.20 | 5分tickでTL観測ノートを生成する確率 | 少なすぎれば上げる、TLが薄い時間帯は下げる |
| `TL_OBSERVATION_NOTE_COUNT` | 20 | TL取得ノート数 | TLが活発なら増やす |
| `TL_OBSERVATION_MIN_POSTS` | 3 | 観測対象が少なすぎる場合のスキップ閾値 | summaryが少ない時間帯に調整 |

- TL観測ノートは `posts.kind = 'tl_observation'` で保存。通常ノートの最短間隔タイマーに影響しない（排他抽選だが時計は分離）。
- TL観測が当たった回のtickは通常ノート抽選をしない（同一tick内排他）。
- text_summaryは本文先頭80字。個人特定情報は保存しない（username/hostは保存するが投稿文には使わない）。
- AI安全分類（`tl_observations`への詳細保存）はPhase 4以降。

## 5分抽選・フォロー返し・リプライの動作確認

- 5分抽選・フォロー返し・リプライは実装済みで実機動作を確認済み（2026-05-02）。
- `docker compose logs -f bot | grep -E "postDraw|scheduledPost|tlObservation|quoteRenote|follow|reply|consent"` でログを確認。

## NoteHint（お題・口調・文体・記憶深度）の暫定値

以下はコード内固定値。実投稿で偏りが出たら調整する。

| 項目 | 暫定値 | 変更場所 |
|---|---|---|
| normal depth | 90% | `note-hint.ts` drawMemoryDepth |
| reminisce depth | 5% | 同上 |
| reference depth | 5% | 同上 |
| 文体パターン数 | 4種 | `note-hint.ts` noteStyles |
| お題数 | 20種 | `note-hint.ts` topics |
| 口調数 | 6種 | `note-hint.ts` tones |

改善候補（imp-plan Phase 2追加項目に記録済み）:
- お題・口調・文体をDBマスタに移行してGUIから変更可能にする
- 直近投稿の同カテゴリ連続を避ける重みづけ
- 時間帯（朝・昼・夜・深夜）ごとの出現確率調整

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

# Implementation Wait

未解決の問題、または実装確定だが具体化が残っている項目を置く。

実装候補として整理できたものは `docs/candi-ref/` に移す。

## 実装前ブロッカー

- [ ] misskey.io BotアカウントのAPI tokenを用意する（運用時）。
- [ ] ピン留め同意ノートを作成し、note idを環境変数 `PINNED_CONSENT_NOTE_ID` に設定する。
- [ ] Botフラグを付ける（misskey.io設定）。
- [ ] 管理者アカウント `@unibell4` をプロフィールまたはピン留めノートに明記する。

## Misskey API / 実機確認済み

- [x] `notes/create` での投稿動作確認済み。
- [x] `i/notifications` によるリプライ・メンション・フォロー通知取得確認済み。
- [x] `notes/reactions` によるピン留め同意ノートの❤リアクション確認確認済み。
- [x] ❤リアクションしたユーザーを `experience_source_consents` に保存確認済み。
- [x] フォロー通知検知とフォロー返し動作確認済み。
- [x] DM（`visibility=specified`）でのフォロー案内送信確認済み。

**未確認・未確定:**
- [ ] `notes/create` で❤のみリアクション受付を指定する具体的な値（MVPでは手動作成で回避）。

## 投稿スケジューリング

- [x] 5分周期のpost-drawと行動ガチャを実装済み（`src/scheduled-post.ts`）。
- [ ] **30分周期の体験候補収集バッチは5分ガチャに統合済み**（`tl-scan.ts` はpost-draw時に実行）。
- [ ] おはよう / おやすみ確率の具体式（将来拡張）。
- [ ] 寝言を月2回程度にする確率設計（将来拡張）。
- [ ] 寝言の内容の安全範囲（将来拡張）。

## AI生成投稿の多様性

- [x] 多様性ルール・直前パターン提示・tiered記憶参照は2026-05-02に実装済み。
- [x] 記憶深度ガチャ（normal 90% / reminisce 5% / reference 5%）実装済み。
- [x] お題（20種）× 口調（6種）× 文体パターン（4種）のガチャ実装済み。

**残課題**:
- [ ] モデルごとの多様性をベンチマーク比較する（chutes-model-compareで評価予定）。
- [ ] temperatureや表現ジャンルの指示をさらに調整する。

## AI provider・人格チューニング

- [x] Chutes primary / OpenAI fallbackは実装済み（`character-spec.ts` / `chat-api.ts`）。
- [ ] `base-personal.md` の人格・口調が生成文に反映されているか運用しながら確認する。
- [ ] BOT自認（通常ノートでは人間として振るまう）のprompt反映は継続調整中。
- [ ] `public` visibilityを継続するか `home` に戻すかは運用判断。
- [ ] P1/P2でAI設定をGUIから編集できる管理画面を作る。

## TL観測・行動ガチャ（Phase 3 MVP完了）

以下は暫定実装した設定値。実投稿の様子を見てDBマスタ（`m_runtime_setting`）で調整する。

| 設定キー | 暫定値 | 意味 | 変更の目安 |
|---|---|---|---|
| `TL_OBSERVATION_POST_PROBABILITY` | 0.20 | 5分tickでTL観測ガチャに入る確率（通常モード） | 少なすぎれば上げる、TLが薄い時間帯は下げる |
| `TL_OBSERVATION_NOTE_COUNT` | 20 | TL取得ノート数 | TLが活発なら増やす |
| `TL_OBSERVATION_MIN_POSTS` | 3 | 観測対象が少なすぎる場合のスキップ閾値 | summaryが少ない時間帯に調整 |
| `QUOTE_RENOTE_PROBABILITY` | 0.20 | TL観測内での引用RN確率（通常モード） | 引用RN頻度を調整 |
| `BETA_TEST1_ENABLED` | false | beta-test1モード切り替え | trueでTL観測80%/引用RN25%に |

**実装済み:**
- [x] TL観測ノートは `posts.kind = 'tl_observation'` で保存。
- [x] 通常ノートの最短間隔タイマーに影響しない（排他抽選）。
- [x] text_summaryは本文先頭80字。個人特定情報は保存しない。
- [x] AI安全分類（`classify-quote-safety.ts`）実装済み。
- [x] 引用RN成功時に `experience_logs` に記録。

## 5分抽選・フォロー返し・リプライの動作確認

- [x] 5分抽選・フォロー返し・リプライは実装済みで実機動作を確認済み（2026-05-02）。
- [x] `docker compose logs -f bot | grep -E "postDraw|scheduledPost|tlObservation|quoteRenote|follow|reply|consent"` でログを確認可能。

## NoteHint（お題・口調・文体・記憶深度）の暫定値

以下はコード内固定値（`src/note-hint.ts`）。実投稿で偏りが出たら調整する。

| 項目 | 暫定値 | 変更場所 |
|---|---|---|
| normal depth | 90% | `note-hint.ts` drawMemoryDepth |
| reminisce depth | 5% | 同上 |
| reference depth | 5% | 同上 |
| 文体パターン数 | 4種 | `note-hint.ts` noteStyles |
| お題数 | 20種 | `note-hint.ts` topics |
| 口調数 | 6種 | `note-hint.ts` tones |

**改善候補**（将来対応）:
- [ ] お題・口調・文体をDBマスタに移行してGUIから変更可能にする
- [ ] 直近投稿の同カテゴリ連続を避ける重みづけ
- [ ] 時間帯（朝・昼・夜・深夜）ごとの出現確率調整

## ローカルDocker常駐

- [x] 採用: 単一のDocker常駐 `bot` プロセス内で、毎分pollingと5分ごとのpost-drawを両方実行する。
  - polling: `POLL_INTERVAL_SECONDS`（60秒）
  - post-draw: `POST_DRAW_INTERVAL_SECONDS`（300秒）
- [x] pollと投稿抽選は、それぞれ重複実行ガードを持つ。
- [x] `SCHEDULED_POSTING_ENABLED` を最終安全スイッチとして残す。
- [x] GitHub Actionsの定期投稿workflowは停止済み。Docker側と二重起動しないこと。

**運用注意**:
- ローカルDocker側で5分投稿抽選を動かす場合、PC停止・Docker停止時は投稿されない前提を運用に明記する。

## Phase 4以降の未実装機能

### 体験候補蓄積フロー（`experience_candidates`）

- [ ] 許可済みユーザーが見つからない時の最大10回探索を実装する。
- [ ] TL観測に使う20ノートから「特定の話題に偏っている」と判定するAI prompt。
- [ ] 体験候補を弾くブラックリスト方式のAI prompt。
- [ ] 候補の有効期限（`expires_at`）の運用ルール決定。

### rate limit実装（Phase 6）

- [ ] `m_rate_limit` テーブルの値を実際の制限ロジックに適用する。
- [ ] 1時間あたり最大5ノート、1日あたり最大50ノートの制限。
- [ ] 引用Renote 1日最大5回の制限。
- [ ] リプライやフォロー起点のユーザー操作投稿が5分に5件を超えた場合の休止。

### エモーション画像添付（Phase 7）

- [ ] `m_emotion_asset` テーブルの初期値投入。
- [ ] 各画像のemotionラベル決定。
- [ ] Misskey Drive upload処理。
- [ ] 投稿時の `fileIds` 添付。
- [ ] 直近使用履歴による連続使用回避。

### マスタ定義

- [ ] `m_safety_rule` の初期ルールを、実装用の辞書・正規表現・AI分類カテゴリへ落とす。
  - CW, NSFW, 個人情報, 病気, 事故, 揉め事, 政治, 医療, 投資, 成人向け, 攻撃的内容
- [ ] 不適切語フィルタの初期辞書（運用後にユーザーが添削）。
- [ ] `m_emotion_asset` の初期ラベル（Phase 7）。

### キャラクター設計

- [ ] 許可依頼文と体験投稿文を、実働テストで調整する。
- [ ] 容姿概要の裏設定を決める（Q.010「謎」の内容）。

## 削除された項目

以下は実装済みまたは設計変更により削除された項目:

- ~~30分周期の体験候補収集バッチ~~ → 5分post-drawに統合
- ~~`experience_sources` テーブル~~ → `experience_candidates` に統合予定
- ~~`consent_requests` テーブル~~ → `consent_guides` にリネーム済み
- ~~`memory_atoms` テーブル~~ → Phase 4以降で検討
- ~~`note_exp_history` テーブル~~ → 将来の統合ビュー候補

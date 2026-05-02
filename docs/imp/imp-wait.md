# Implementation Wait

未解決の問題、または実装確定だが具体化が残っている項目を置く。

実装候補として整理できたものは `docs/candi-ref/` に移す。

## Misskey API / 未確認

- [ ] ❤を受け付けてから受付データが消えてしまった際の、同ノートからのリアクションユーザーの再登録スクリプト実装。

## 投稿スケジューリング

- [ ] おはよう / おやすみ確率の具体式（将来拡張）。
- [ ] 寝言を月2回程度にする確率設計（将来拡張）。
- [ ] 寝言の内容の安全範囲（将来拡張）。

## AI生成投稿の多様性

- [ ] モデルごとの多様性をベンチマーク比較する（chutes-model-compareで評価予定）。
- [ ] temperatureや表現ジャンルの指示をさらに調整する。

## AI provider・人格チューニング

- [ ] `base-personal.md` の人格・口調が生成文に反映されているか運用しながら確認する。
- [ ] BOT自認（通常ノートでは人間として振るまう）のprompt反映は継続調整中。
- [ ] `public` visibilityを継続するか `home` に戻すかは運用判断。
- [ ] P1/P2でAI設定をGUIから編集できる管理画面を作る。

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

- ~~30分周期の体験候補収集バッチ~~ → action-flow-v2で10分ごとの独立タイマー `experience-scan.ts` に変更（2026-05-03）
- ~~TL_OBSERVATION_POST_PROBABILITY~~ → action-flow-v2でガチャ構造変更。`QUOTE_RENOTE_PROBABILITY` + `TL_REFERENCE_PROBABILITY` に分離
- ~~`experience_sources` テーブル~~ → `experience_candidates` に統合予定
- ~~`consent_requests` テーブル~~ → `consent_guides` にリネーム済み
- ~~`memory_atoms` テーブル~~ → Phase 4以降で検討
- ~~`note_exp_history` テーブル~~ → 将来の統合ビュー候補

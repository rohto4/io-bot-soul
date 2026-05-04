# Implementation Tasks

このファイルは、io-bot-soul の**実装状況と実装待ち**だけを扱う。

- ユーザー判断待ちは `user-judge.md` に置く。
- ユーザーが実機で確認する作業は `user-tasks.md` に置く。
- 完了記録は `imp-comp.md` に追記する。

**最終更新**: 2026-05-04
**未完了の実装タスク**: 24件

---

## 現在の優先候補

1. **P6-AI**: AI日次上限の実装。
2. **P7**: エモーション画像添付。
3. **P2X**: NoteHint / 管理画面のDB化。
4. **REF**: 実装済み機能の整理・重複削除。

---

## Phase 4.x: 体験候補蓄積の拡張

- [ ] **P4X-1**: 許可済みユーザーが見つからない時の追加探索を `experience-scan.ts` に追加。
  - 現在は `runTlScanPassive` の `summaries` に対して1パス。
  - 追加TL取得にするか、非許可ユーザーのノートを安全判定だけに使うかは `user-judge.md` で判断後に実装する。
- [ ] **P4X-2**: TL観測の20ノートから「特定の話題に偏っている」と判定するAI prompt を実装。
  - 例: 20件中の多くが同じ話題なら `tl_observations` に抽象化summaryを記録。
- [x] **P4X-3**: 軽量フィルタ `src/safety-filter.ts` を作成し、`quote-pick.ts` / `experience-scan.ts` のAI判定前に挿入。（2026-05-04）

---

## Phase 5: 体験投稿と記憶化

- [x] **P5-1**: `generate-post.ts` に `experience_logs` 注入ロジックを実装済み。（2026-05-04）
- [x] **P5-2**: `buildUserMessage` の体験ログ参照フレームを実装済み。（2026-05-04）
- [x] **P5-3**: `daily-cleanup.ts` に `expireOldCandidates` を追加。（2026-05-04）
- [x] **P5-4**: `daily-cleanup.ts` に `deleteOldSourceNotes` を追加。（2026-05-04）

---

## Phase 6: rate limit・error backoff・安全制御

### rate limit

- [x] **P6-1**: `src/rate-limit.ts` に `checkNotesPerHour` / `checkNotesPerDay` / `checkQuoteRenotesPerDay` を実装。（2026-05-04）
- [x] **P6-2**: `src/scheduled-post.ts` に投稿rate limitチェックを追加。（2026-05-04）
- [x] **P6-3**: `checkUserTriggeredPer5Min` を追加し、`probe.ts` のリプライ処理に適用。（2026-05-04）
- [x] **P6-4**: `srcx/test/rate-limit.test.ts` を追加。（2026-05-04）
- [x] **P6-5**: `QUOTE_RENOTES_PER_DAY` が通常ノートを止めないよう、引用RNルート内だけでチェックするよう修正。（2026-05-04）

### error backoff

- [x] **P6-6**: `bot_state` に `ai_failure_streak` / `ai_backoff_until` を追加し、AI失敗時のbackoffを実装。（2026-05-04）
- [x] **P6-7**: `AI_BACKOFF_BASE_SECONDS` / `AI_BACKOFF_MAX_SECONDS` を `m_runtime_setting` に追加。（2026-05-04）

### AI日次上限

- [ ] **P6-AI-1**: `src/db/schema.ts` に `ai_usage_logs` テーブルを追加。
  - カラム案: `used_at`, `provider`, `request_type`, `success`
  - 既存設定: `AI_DAILY_MAX_REQUESTS`, `AI_DAILY_MAX_FALLBACK_REQUESTS`
- [ ] **P6-AI-2**: `callAiWithFallback` の呼び出し前後でAI使用量を記録・判定する。
  - primary上限: `AI_DAILY_MAX_REQUESTS`
  - fallback上限: `AI_DAILY_MAX_FALLBACK_REQUESTS`
- [ ] **P6-AI-3**: `srcx/test/ai-rate-limit.test.ts` を追加。

### safety

- [ ] **P6-SAFE-1**: `m_safety_rule` の初期ルールを実装用カテゴリへ整理する。
  - カテゴリ: CW, NSFW, 個人情報, 病気, 事故, 揉め事, 政治, 医療, 投資, 成人向け, 攻撃的内容
- [ ] **P6-SAFE-2**: 不適切語フィルタの初期辞書を `docs/candi-ref/` に整理し、`safety-filter.ts` と同期しやすい形にする。

---

## Phase 7: エモーション画像添付

- [ ] **P7-1**: `m_emotion_asset` テーブルの初期値をmigrationで投入。
- [ ] **P7-2**: 各画像のemotionラベルを決め、`docs/candi-ref/emotion-assets.md` に記録。
- [ ] **P7-3**: Misskey Drive upload処理を `src/misskey/client.ts` に追加。
- [ ] **P7-4**: `MisskeyClient.createNote` に `fileIds?: string[]` を追加。
- [ ] **P7-5**: `src/emotion-picker.ts` を追加し、投稿内容から画像を選ぶ。
- [ ] **P7-6**: `scheduled-post.ts` の投稿処理に画像添付を組み込む。
- [ ] **P7-7**: `srcx/test/emotion-pick.test.ts` を追加。

---

## Phase 2.x: NoteHint・管理画面

- [ ] **P2X-1**: お題リスト、口調リスト、文体パターンをDB管理に移行。
  - テーブル案: `m_note_hint_topic`, `m_note_hint_tone`, `m_note_hint_style`
- [ ] **P2X-2**: 直近投稿のお題カテゴリを記録し、同カテゴリ連続を避ける重みづけを追加。
- [ ] **P2X-3**: 時間帯ごとのお題出現確率を実装。
- [ ] **P2X-4**: Web管理画面の基礎を作成。
  - 編集対象: `m_runtime_setting`, `m_note_hint_*`, `bot_state`

---

## AI・運用補助の実装

- [ ] **AI-IMPL-1**: モデルごとの多様性を比較するスクリプトを作成。
  - 例: `scripts/chutes-model-compare.ts`
- [ ] **AI-IMPL-2**: AI設定GUIを実装する。
  - `P2X-4` と同時に扱う。

---

## リファクタリング・整理

- [ ] **REF-1**: `src/db/schema.ts` の `EXPERIENCE_MEMORY_ENABLED` 重複seedを削除。
- [ ] **REF-2**: 未使用の `src/ai/generate-tl-post.ts` を削除し、関連ドキュメントを更新。
- [ ] **REF-3**: `runTlScan` と `runTlScanPassive` の重複を内部共通関数へ切り出す。
- [ ] **REF-4**: `experience_candidates.source_note_id` に実際のMisskey note IDを保存できるよう、`runTlScanPassive` の戻り値を拡張する。

---

## 完了・廃止済み

詳細は `imp-comp.md` を正とする。

- [x] Phase 2.5: NoteHint 記憶深度確率DB移行
- [x] Phase 2.6: 睡眠システム
- [x] Phase 3.5: 体験候補専用AI判定
- [x] Phase 4: 体験候補投稿フロー
- [x] Phase 5一部: 体験ログ参照・期限切れ掃除
- [x] Phase 6一部: 投稿rate limit / user-triggered rate limit / AI backoff


# Implementation Task Board

このファイルは、io-bot-soul の未実装タスクを**実装単位に分解**したタスクボードです。
完了したタスクは `[x]` にし、更新日を記録します。

**最終更新**: 2026-05-04
**残タスク数**: 55件（未完了） / 合計68件

---

## Phase 4: 体験候補蓄積・投稿フロー（experience_candidates → 投稿）

- [x] **P4-1**: `EXPERIENCE_CANDIDATE_POST_PROBABILITY` を `m_runtime_setting` に追加（seed）。初期値 `0.10`。（2026-05-04）
- [x] **P4-2**: `src/db/schema.ts` の `seedRuntimeSettings` に P4-1 の設定を追加。（2026-05-04）
- [x] **P4-3**: 新規 `src/experience-pick.ts` — `status='pending'` かつ `expires_at > now` の候補からランダムに1件を選ぶ関数 `pickExperienceCandidate` を実装。（2026-05-04）
- [x] **P4-4**: 新規 `src/ai/generate-experience-post.ts` — 選ばれた候補（summary + source_user_id）から「かなめがその体験をした」ノート文を生成するAIプロンプトを実装。（2026-05-04）
- [x] **P4-5**: `src/scheduled-post.ts` に「体験候補投稿ガチャ」を追加（独立ガチャ、5分tick）。（2026-05-04）
- [x] **P4-6**: `src/scheduled-post.ts` の既存テストに、体験候補ガチャが「外れ」た場合の `rand()` 消費を加味した調整。（2026-05-04）
- [ ] **P4-7**: 新規テスト `srcx/test/experience-pick.test.ts` — `pickExperienceCandidate` の単体テスト。
- [ ] **P4-8**: 新規テスト `srcx/test/scheduled-post-experience.test.ts` — 体験候補投稿ガチャの統合テスト。
- [ ] **P4-9**: `imp-comp.md` に Phase 4 完了記録を追加。

---

## Phase 4.x: 体験候補蓄積の拡張機能

- [ ] **P4X-1**: 許可済みユーザーが見つからない時の最大10回探索を `experience-scan.ts` に追加。
  - 現在は `runTlScanPassive` の `summaries` に対して1パスしかしていない。
  - 許可済みユーザーが1件も含まれない場合、追加でTLを取得するか、非許可ユーザーのノートも安全判定のみで候補に入れるかを設計判断。
- [ ] **P4X-2**: TL観測の20ノートから「特定の話題に偏っている」と判定するAI prompt を実装。
  - 例: 全20件のうち80%が「ゲーム」→ 偏りありとして `tl_observations` に「ゲームブーム」的なsummaryを記録。
- [ ] **P4X-3**: 体験候補を弾くブラックリスト方式のAI判定を実装。
  - すでに `classify-experience-candidate.ts` で実装済みの「安全判定」とは別に「この話題は体験として不適切」というブラックリストを追加。
  - `docs/candi-ref/` にブラックリストカテゴリを整理。

---

## Phase 5: 体験投稿と記憶化（experience_logs 本格活用）

- [ ] **P5-1**: `src/ai/generate-post.ts` の `buildUserMessage` に `experience_logs` からのランダムサンプルを注入するロジックが既にあるか確認。ない場合は追加。
  - `EXPERIENCE_MEMORY_ENABLED`, `EXPERIENCE_MEMORY_SAMPLE_COUNT`, `EXPERIENCE_MEMORY_PROMPT_WEIGHT` を参照。
- [ ] **P5-2**: `generate-post.ts` のプロンプトに「以前〜〜した」という体験ログ参照フレームを追加。
  - 例: `[以前の体験] 商店街で気になる店を見つけた / [重み: 50]` のような形式。
- [ ] **P5-3**: `EXPERIENCE_MEMORY_PROMPT_WEIGHT` の実際の効果を検証するためのテスト投稿（実機またはモック）。
- [ ] **P5-4**: `experience_candidates` の `status='pending'` かつ `expires_at < now` のレコードを `expired` に更新するバッチ処理を作成。
  - 実装先: `daily-cleanup.ts` または `experience-scan.ts` の末尾。
- [ ] **P5-5**: `source_notes` の `captured_at` が30日以上前のレコードを定期削除するバッチを追加。
  - `DAILY_CLEANUP_INTERVAL_SECONDS` と同じタイミングで実行。

---

## Phase 6: rate limit・error backoff・安全制御

### rate limit 実装

- [x] **P6-1**: 新規 `src/rate-limit.ts` — `checkNotesPerHour` / `checkNotesPerDay` / `checkQuoteRenotesPerDay` を実装。（2026-05-04）
- [x] **P6-2**: `src/scheduled-post.ts` の睡眠フロー直後に rate limit チェックを挿入。（2026-05-04）
- [ ] **P6-3**: `src/probe.ts` のリプライ処理前に `checkUserTriggeredPer5Min` を呼び出し。
  - 超過時: `poll.skip` / `reason: "user_triggered_rate_limit"`
- [x] **P6-4**: 新規テスト `srcx/test/rate-limit.test.ts` — rate limit 判定の単体テスト。（2026-05-04）

### error backoff

- [ ] **P6-5**: `src/ai/chat-api.ts` または `src/scheduled-post.ts` に、AI API連続失敗時のバックオフロジックを追加。
  - 実装案: `bot_state` に `ai_failure_streak` と `ai_backoff_until` を追加。
  - 失敗1回: 次の5分tickはスキップ。失敗2回: 15分スキップ。失敗3回: 1時間スキップ。成功でリセット。
- [ ] **P6-6**: `m_runtime_setting` に `AI_BACKOFF_BASE_SECONDS`, `AI_BACKOFF_MAX_SECONDS` を追加。

### AI日次上限

- [ ] **P6-7**: `src/db/schema.ts` に `ai_usage_logs` テーブルを追加（`used_at`, `provider`, `request_type`, `success`）。
  - 既存: `m_runtime_setting` に `AI_DAILY_MAX_REQUESTS=200`, `AI_DAILY_MAX_FALLBACK_REQUESTS=30` は存在するが未使用。
- [ ] **P6-8**: `callAiWithFallback` の呼び出し前に日次上限チェックを追加。
  - primary（Chutes）上限: `AI_DAILY_MAX_REQUESTS`
  - fallback（OpenAI）上限: `AI_DAILY_MAX_FALLBACK_REQUESTS`
- [ ] **P6-9**: `srcx/test/ai-rate-limit.test.ts` — AI日次上限のテスト。

### 安全・マスタ定義

- [ ] **P6-10**: `m_safety_rule` の初期ルールを実装用の辞書・正規表現・AI分類カテゴリへ落とし込む。
  - カテゴリ: CW, NSFW, 個人情報, 病気, 事故, 揉め事, 政治, 医療, 投資, 成人向け, 攻撃的内容
  - 実装案: `src/safety-filter.ts` を新規作成。正規表現ベースの軽量フィルタ + AI判定との組み合わせ。
- [ ] **P6-11**: 不適切語フィルタの初期辞書を `docs/candi-ref/` に整理。
- [ ] **P6-12**: `src/quote-pick.ts` / `src/experience-scan.ts` に軽量フィルタ（正規表現ベース）を追加し、明らかなNGワードはAI判定前に弾く。

---

## Phase 7: エモーション画像添付

- [ ] **P7-1**: `m_emotion_asset` テーブルの初期値を `seedRuntimeSettings` ではなく `schema.ts` の migration で投入。
  - 初期値: `asset_key`, `file_path`, `asset_type`, `emotion`, `priority` など。
- [ ] **P7-2**: 各画像のemotionラベルを決定。`docs/candi-ref/emotion-assets.md` に記録。
  - 例: `relaxed`, `curious`, `excited`, `sleepy`, `frustrated`, `proud`
- [ ] **P7-3**: Misskey Drive upload処理を `src/misskey/client.ts` に追加。
  - API: `drive/files/create`（multipart/form-data）
  - 関数: `uploadDriveFile(buffer, filename, folderId?)`
- [ ] **P7-4**: 投稿時の `fileIds` 添付を `MisskeyClient.createNote` に追加。
  - `fileIds?: string[]` をオプションに追加。
- [ ] **P7-5**: 新規 `src/emotion-picker.ts` — 投稿内容（text or emotion hint）から適切な `m_emotion_asset` を選ぶロジック。
  - 優先度順。直近24時間の `post_assets` を参照して連続使用を回避。
- [ ] **P7-6**: `src/scheduled-post.ts` の `generateAndPost` に emotions picker を組み込み。
  - ノート生成後、選定した画像の `fileIds` を `createNote` に渡す。
- [ ] **P7-7**: 新規テスト `srcx/test/emotion-pick.test.ts`。

---

## Phase 2.x: NoteHint・管理画面の改善

- [ ] **P2X-1**: お題リスト（20種）、口調リスト（6種）、文体パターン（4種）を `m_runtime_setting` または専用テーブルに移行。
  - 専用テーブル案: `m_note_hint_topic`, `m_note_hint_tone`, `m_note_hint_style`
- [ ] **P2X-2**: 直近投稿の「お題カテゴリ」を記録し、同カテゴリ連続を避ける重みづけを `drawNoteHint` に追加。
  - DBに `bot_state.last_note_hint_category` を追加。
- [ ] **P2X-3**: 時間帯（朝・昼・夜・深夜）ごとにお題の出現確率を調整。
  - 例: 「カップ麺」は深夜に出やすく。「ラボ」は昼間に出やすく。
  - `m_runtime_setting` に `NOTE_HINT_TOPIC_NIGHT_BOOST` のようなキーを追加するか、テーブルで管理。
- [ ] **P2X-4**: Web管理画面（GUI）の基礎を作成。
  - Node.js + Express or Fastify で簡易API + HTML。
  - 編集対象: `m_runtime_setting`, `m_note_hint_*`, `bot_state` の確認。
  - port: 3000, Docker Compose で別サービスとして起動。

---

## AI・人格チューニング

- [ ] **AI-1**: モデルごとの多様性をベンチマーク比較するスクリプトを作成。
  - `scripts/chutes-model-compare.ts` — 同じプロンプトで複数モデルに投げ、出力の多様性（文字数、語彙、構造）を比較。
- [ ] **AI-2**: temperatureや表現ジャンルの指示をさらに調整。
  - `AI_TEMPERATURE_TEXT` の値を段階的に変更し、実投稿で観察。
- [ ] **AI-3**: `base-personal.md` の人格・口調が生成文に反映されているか、実働テストで確認。
  - NGパターンを見つけたら `character-spec.ts` の system prompt を修正。
- [ ] **AI-4**: BOT自認（通常ノートでは人間として振るまう）のprompt反映を継続調整。
  - 現在は「あなたは涼凪かなめです」としてBOTであることを認識させているが、ユーザー視点で「人間っぽいか？」を評価。
- [ ] **AI-5**: `public` visibilityを継続するか `home` に戻すかの運用判断。
  - `docs/candi-ref/visibility-policy.md` に理由を記録。
- [ ] **AI-6**: AI設定GUIの実装。Phase 2.x-4と同タイミングで実施。

---

## キャラクター設計・運用調整

- [ ] **CHAR-1**: 許可依頼文と体験投稿文を、実働テストで調整する。
  - フォローお礼文 (`consent.ts`) のトーンが実際に投下して不自然でないか確認。
  - 体験投稿文 (`generate-experience-post.ts`) の「@username さんのノートを見て…」パターンが自然か確認。
- [ ] **CHAR-2**: 容姿概要の裏設定を決める（Q.010「謎」の内容）。
  - `docs/spec/base-personal.md` の QA セクションに追加。

---

## 実機確認・運用チェックリスト（adjust-tasks.md統合）

- [ ] **CHK-1**: `docker compose up -d --build` 後、`docker compose logs -f bot | grep "postDraw.tick"` で5分ごとにログが出ることを確認。
- [ ] **CHK-2**: `docker compose logs -f bot | grep "experienceScan.tick"` で10分ごとにログが出ることを確認。
- [ ] **CHK-3**: `beta-test1` 有効化（`BETA_TEST1_ENABLED=true`）後、`betaTest1.active` がログに出て確率が変わることを確認。
- [ ] **CHK-4**: 引用RNが許可済みユーザーから実際に行われるか確認。`quoteRenote.posted` と `experience_logs` に記録されるか確認。
- [ ] **CHK-5**: TL参照（`tl_vibe` / `tl_mention`）が実際に行われ、`posts.generated_reason` にその値が入るか確認。
- [ ] **CHK-6**: 体験メモリが `generatePost.experienceMemory` ログでプロンプトに含まれているか確認。
- [ ] **CHK-7**: `experience_candidates` にデータが蓄積されるか確認。
  - ```sql
    SELECT candidate_type, status, COUNT(*) FROM experience_candidates GROUP BY candidate_type, status;
    ```
- [ ] **CHK-8**: `experience_candidates.expires_at` が入っているか確認。
- [ ] **CHK-9**: `scheduledPost.oyasumi` / `ohayou` / `murmur` が就寝・起床時刻に出ることを確認。
- [ ] **CHK-10**: 睡眠中（`bot_state.sleeping=1`）に通常投稿が停止し、`scheduledPost.skip` `reason: sleeping` が出ることを確認。
- [ ] **CHK-11**: `MEMORY_DEPTH_REFERENCE_RATE` を変更後、記憶深度ガチャの分布が変わるか確認（`generatePost.memoryDepth` ログ）。

---

## 削除・廃止済み（記録用）

以下は実装済みまたは設計変更により不要になった項目:

- [x] ~~30分周期の体験候補収集バッチ~~ → action-flow-v2で10分ごとの独立タイマー `experience-scan.ts` に変更（2026-05-03）
- [x] ~~TL_OBSERVATION_POST_PROBABILITY~~ → action-flow-v2でガチャ構造変更。`QUOTE_RENOTE_PROBABILITY` + `TL_REFERENCE_PROBABILITY` に分離
- [x] ~~`experience_sources` テーブル~~ → `experience_candidates` に統合予定
- [x] ~~`consent_requests` テーブル~~ → `consent_guides` にリネーム済み
- [x] ~~`memory_atoms` テーブル~~ → Phase 4以降で検討
- [x] ~~`note_exp_history` テーブル~~ → 将来の統合ビュー候補
- [x] ~~Phase 2.5: NoteHint 記憶深度確率DB移行~~ → 完了（2026-05-04）
- [x] ~~Phase 2.6: 睡眠システム~~ → 完了（2026-05-04）
- [x] ~~Phase 3.5: 体験候補専用AI判定~~ → 完了（2026-05-04）
- [x] ~~`experience_candidates.expires_at` 運用ルール~~ → 作成から3日後として完了（2026-05-04）

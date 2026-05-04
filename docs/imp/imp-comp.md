# Implementation Complete

## 2026-04-29 初期化

- `AGENTS.md`、`PROJECT.md`、`docs/` 標準構成を作成。
- ECC由来skillとcommandを必要範囲で取り込み。
- `init.md` 冒頭に UTF-8・日本語で進める最優先指示を追記。

## 2026-04-29 性格ベース候補

- `docs/candi-ref/base-personal.md` にノートの性格ベース候補を作成。
- 一人称、口調、リアクション方針、Misskey空間の解釈、興味、距離感、活動時間軸、ノートの締め方などを候補として整理。
- 備考として、投稿抽選、生活リズム、おはよう・おやすみ、睡眠中の寝言に関するBOT仕様候補を追加。
- 性格ベースは一旦候補資料として完了。採用仕様化は未決。

## 2026-05-01 Dockerローカル常駐土台

- Node.js/TypeScriptプロジェクトを作成。
- Dockerfile、compose.yaml、.env.exampleを作成。
- SQLite schema migrationを実装。
- 1分pollingと5分投稿抽選の常駐ループ骨組みを実装。
- JSON形式の標準ログを実装。
- Vitestで設定読み込み、DB migration、常駐ループ、loggerをテスト。
- Dockerイメージのbuildと短時間起動スモークを確認。

## 2026-05-01 Misskey実機確認用probe

- Misskey API clientを実装。
- `i/notifications` によるリプライ・メンション通知取得を実装。
- `notes/create` による定型リプライ投稿を実装。
- `notes/reactions` によるピン留め同意ノートの❤リアクション確認を実装。
- ❤リアクションしたユーザーを `experience_source_consents` に `consented` として保存する処理を実装。
- 定型リプライは重複返信を避け、1回のpollingで最大1件に制限。
- 引用RNや体験候補の前段に置く、許可済みユーザー判定を実装。
- 実DBのドライ実行で、`unibell4` と `nekokitiyorio` のみ許可され、未登録ユーザーは拒否されることを確認。
- フォロー通知を検知し、フォロー返しとピン留め同意ノート案内を行う処理を実装。
- フォロー案内は重複投稿を避け、`consent_guides` に記録する。

## 2026-05-01 ワンショット定期処理

- `post-draw` 用のワンショットCLIを作成。
- `npm run scheduled:post-draw` と `npm run scheduled:post-draw:prod` を追加。
- GitHub Actions workflow `.github/workflows/scheduled-post-draw.yml` を作成。
- 定期ノート投稿は `SCHEDULED_POSTING_ENABLED` で明示的に有効化する方式にした。
- 有効化時は直近通常投稿から `SCHEDULED_POST_MIN_INTERVAL_MINUTES` 分以上空いている場合に投稿抽選へ入る。
- 投稿確率は経過時間で上がり、目安は5分後10%、10分後15%、30分後80%、1時間超95%。
- `SCHEDULED_POST_MIN_INTERVAL_MINUTES` と投稿確率はDBマスタ `m_runtime_setting` へ移した。
- リプライ・フォロー・リアクション監視の処理上限も `m_runtime_setting` へ移した。
- 投稿成功時は `posts` に `kind = normal`、`generated_reason = scheduled_post_draw_v0` で記録し、`bot_state.last_note_at` を更新する。
- workflowは5分ごとのscheduleと手動実行に対応。
- 現時点の投稿文はAI生成を優先し、AI失敗時は設定に従ってskipまたは固定テンプレートfallbackにする。体験候補選定と引用Renote連携は未実装。

## 2026-05-01 常駐アプリの役割整理

- Docker常駐アプリは、毎分pollingによるフォロー返し、リプライ返信、同意リアクション確認に絞った。
- 5分ごとの通常ノート投稿抽選はGitHub Actionsの `Scheduled Post Draw` に分離した。
- 常駐pollは前回処理がまだ実行中なら `poll.skip` / `reason = already_running` として重複実行を避ける。
- `POST_DRAW_INTERVAL_SECONDS` は不要になったため、環境変数とworkflow envから削除した。
- スクリプトの役割分担を `docs/guide/script-overview.md` に整理した。

## 2026-05-02 Docker常駐への定期投稿移行

- GitHub Actionsの定期投稿workflowを削除し、5分ごとの投稿抽選をDocker常駐プロセスへ移した。
- `POST_DRAW_INTERVAL_SECONDS` を復活させ、初期値を300秒にした。
- `npm start` / `src/main.ts` は、毎分pollingとpost-drawタイマーの両方を起動する。
- post-drawは前回処理がまだ実行中なら `postDraw.skip` / `reason = already_running` として重複実行を避ける。
- `SCHEDULED_POSTING_ENABLED` は引き続き最終安全スイッチとして残す。
- `npm run scheduled:post-draw:prod` はDocker手動確認用のワンショット入口として残す。

## 2026-05-01 Neon/Postgres移行土台

- DB操作をSQLite直結から共通 `DbClient` へ移行。
- `DATABASE_PROVIDER=sqlite|postgres` で接続先を切り替える構成に変更。
- Neon用に `pg` を追加。
- Postgres用schema変換を追加し、`AUTOINCREMENT` をidentity columnへ変換。
- GitHub Actions workflowで `DATABASE_PROVIDER` と `DATABASE_URL` を読むように変更。

## 2026-05-02 AI投稿プロンプト改善

- systemPrompt冒頭を「Misskey高校・家・図書館・ラボ・商店街・ゲーセン・近所の河原を拠点に生活」に変更。TL観測ログBot固定から脱却。
- 多様性ルールを追加（直前と同じ書き出し・締め方禁止、特定フレーズ3連続禁止）。
- userMessageに直前3件の書き出し・締め方パターンを明示して回避指示。
- 投稿例を全削除（バイアス源だったため）。
- 過去投稿参照を時間重みづけtiered samplingに変更（直近7日全量・7〜30日3件おき・30〜60日10件おき）をSQL CTE一本で実現。
- 過去投稿への文脈フレームを追加。
- `src/ai/character-spec.ts` でキャラクター仕様を共通化。
- `src/ai/chat-api.ts` でAI API呼び出し・fallbackロジックを共通化。

## 2026-05-02 Phase 3: TL観測ノート・行動ガチャ・引用RN

- `src/tl-scan.ts` 実装: ホームTL取得（limit=20）・CW/renote/空テキスト除外・`source_notes` 保存・`bot_state.last_timeline_scan_at` 更新。
- `src/ai/generate-tl-post.ts` 実装: TL観測ベースの投稿生成（個人特定なし・かなめの観察視点ルール付き）。
- `src/quote-pick.ts` 実装: 許可済みユーザーから引用候補を選定。
  - 1週間以内のノートのみ対象。
  - 構造フィルタ（CW/reply/renote/非公開除外）後にAI安全判定を実施。
- `src/ai/classify-quote-safety.ts` 実装: 医療・政治・個人情報等をNG判定するバイナリ分類プロンプト（maxTokens=5、temperature=0.0）。判定失敗はNG扱い。
- `src/ai/generate-quote-post.ts` 実装: 引用に添えるコメント生成（1〜2文）。
- `src/scheduled-post.ts` に行動ガチャを追加:
  - TL観測20%（当たり → TL観測ノート or 引用RN）
  - 引用RN 20%（TL観測内の1/5 = 全体4%）
  - TL観測外れ → 通常ノート抽選（既存確率テーブル）
- `src/misskey/client.ts` に `getHomeTimeline` / `getUserNotes` / `createNote.renoteId` を追加。
- テスト47件通過（tl-scan.test.ts 新規追加含む）。
- Misskey API調査: 複数ユーザーID一括ノート取得APIは存在しない。`users/notes` は単一userId専用。

## 2026-05-02 行動ガチャ3フェーズ構造リファクタ

- `scheduled-post.ts` を「⑴ガチャ（random/DB読み取り）→ ⑵取得（Misskey API + AI安全分類）→ ⑶AI生成・投稿」の3フェーズ構造に全面書き換え。
- TL観測ガチャが当たった場合は通常ノートへ絶対に落ちない（旧設計の fallthrough を削除）。
- `too_few_summaries` / TL obs AI失敗 → skip（通常ノートにならない）。
- `docs/spec/legacy-flows.md` に Mermaid で全体フローを記録。

## 2026-05-02 beta-test1モード

- `m_runtime_setting` に `BETA_TEST1_ENABLED=false` を追加。
- ON時: TL観測80%・引用RN25%（overall 20%）・通常ノート経過時間5倍。
- DB更新で即時反映（再起動不要）。

## 2026-05-02 フォロー案内をDMに変更

- `handleFollowNotification`: `visibility="specified"` + `visibleUserIds=[user.id]` に変更。
- `MisskeyClient.createNote` に `visibleUserIds` を追加。

## 2026-05-02 引用RN・TL観測を記憶参照に追加 + 体験ログ記録

- `generate-post.ts` の tiered SQL を `kind='normal'` → `normal/tl_observation/quote_renote` に拡張。
- `[TL観測]` `[引用RN]` ラベルでAIが種別を認識できるように。
- 引用RN成功時に `experience_logs` に記録（source_note_id, source_user_id, summary）。
- 引用RN候補: 直近24時間を優先して並べ、古い順はその後。

## 2026-05-02 記憶深度ガチャ（MemoryDepth）

- `note-hint.ts` に `MemoryDepth` 型を追加。normal 90% / reminisce 5% / reference 5%。
- `generate-post.ts`: normal はtop3のみ（軽量）、reminisce は60日内ランダム5件、reference は60日内ランダム1件。
- buildUserMessage をdepthに応じた3パターンのプロンプトに分岐。

## 2026-05-02 お題・口調・文体パターンガチャ（NoteHint拡張）

- `NoteHint` にお題（20種）・口調（6種）・文体パターン（4種）を追加。
- 文体パターン: 短文観察 / 思考の連鎖 / 考察・断言型 / 生活感・行動報告。
- 文体パターンは行ごとの役割説明のみで注入（具体的な例文を避け、内容の引っ張りを防止）。
- normal depthのときのみ style を設定。reminisce/reference には設定しない。

## 2026-05-02 OpenCode / oh-my-openagent グローバル設定整備

- グローバル `~/.config/opencode/opencode.json` に plugin エントリ・Chutes プロバイダー定義・デフォルトモデル設定がなく、io-bot-soul 以外のすべての PJ で oh-my-openagent と Chutes が動作しない状態だったことを特定した。
- `CHUTES_API_KEY` が Windows ユーザー環境変数に未登録で `{env:CHUTES_API_KEY}` が空文字になっていたことを特定した。
- `CHUTES_API_KEY` を `HKCU\Environment` に登録した。
- グローバル `opencode.json` を `plugin: ["oh-my-openagent@latest"]` + Chutes プロバイダー全モデル定義 + デフォルトモデル設定で全面書き換えた。
- `opencode debug config` で `plugin_origins.scope=global` を確認し、全 PJ での動作を検証した。
- `docs/guide/opencode/global-config/opencode.json` テンプレートを実設定と同期した。
- `docs/guide/opencode/oc-active-init.md` を全面改訂し、Phase 1（全マシン一度）と Phase 2（PJ ごと）の 2 段階構成に整理した。
- 調査内容を `docs/guide/opencode/99_調査結果/investigation-20260502.md` にまとめた。
- `docs/spec/teck-stack.md` に設定方針・修正内容・検証結果を追記した。

## 2026-05-01 AI provider方針と疎通確認

- AI生成・分類はChutesをprimary、OpenAIをfallbackにする方針を確定。
- `.env.example` とGitHub Actions workflowには `CHUTES_API_KEY`、`OPENAI_API_KEY` のsecretだけを追加。
- AI provider、model id、使用量上限、失敗時挙動などの非secret設定はDBマスタ `m_runtime_setting` で管理する方針に変更。
- `m_runtime_setting` テーブルと初期値seedを追加。
- Chutes API keyの疎通を確認。
- Chutes `/models` の取得を確認。
- Chutesの正式model idは `moonshotai/Kimi-K2.5-TEE` と確認。
- Chutes `chat/completions` で `moonshotai/Kimi-K2.5-TEE` の疎通を確認。
- OpenAI API keyの疎通を確認。
- OpenAI `gpt-5.4-mini` の疎通を確認。
- Chutesは `max_tokens`、OpenAI `gpt-5.4-mini` は `max_completion_tokens` が必要と確認。
- Chutes Kimiは内部推論で `reasoning_tokens` を消費し、token上限が小さいと `content = null` になることを確認。

## 2026-05-04 Phase 2.5 + Phase 2.6 + Phase 3.5 実装（深夜セッション）

### Phase 2.5: NoteHint 記憶深度確率 DB移行
- `note-hint.ts`: `drawNoteHint` / `drawMemoryDepth` に `settings?: RuntimeSettings` を追加。
- DBから `MEMORY_DEPTH_REFERENCE_RATE` / `MEMORY_DEPTH_REMINISCE_RATE` を読むように変更（未指定時は0.05で後方互換）。
- `scheduled-post.ts`: `drawNoteHint(rand)` → `drawNoteHint(rand, settings)` に変更。
- `schema.ts`: seed に `MEMORY_DEPTH_REFERENCE_RATE` / `MEMORY_DEPTH_REMINISCE_RATE` を追加。

### Phase 2.6: 睡眠システム
- `sleep-schedule.ts` 新規: `computeNextSleepAt` / `computeNextWakeAt` を実装。
  - JST変換、曜日別設定、jitter（±30分）、`SLEEP_TIME<06:00` の翌日扱い。
- `generate-sleep-post.ts` 新規: `generateOyasumiPost` / `generateOhayouPost` / `generateMurmurPost`。
  - `buildCharacterSystemPrompt` 活用。maxTokens: 300, temperature: 0.9。
- `scheduled-post.ts`: `runScheduledPostDraw` の先頭に睡眠フロー（就寝→起床→寝言→通常）を挿入。
  - sleeping=1 の間は通常投稿停止。投稿は `generated_reason = oyasumi/ohayou/murmur` で記録。
- `schema.ts`: seed に曜日別 `SLEEP_TIME_*` / `WAKE_TIME_*`（14件）+ `SLEEP_SCHEDULE_JITTER_MINUTES` + `MURMUR_PROBABILITY_PER_TICK` を追加。

### Phase 3.5: 体験候補専用AI判定
- `classify-experience-candidate.ts` 新規: 引用なし前提のゆるい安全判定。
  - OK: 日常・趣味・食事・ゲーム・感情の軽い表現・季節・天気・技術・学習・ミーム。
  - NG: 個人特定情報・深刻な病気/事故/死・激しい怒り/炎上/攻撃・政治・成人向け。
- `experience-scan.ts`: `classifyQuoteSafety` → `classifyExperienceCandidate` に差し替え。
- `experience-scan.ts`: `experience_candidates` INSERT に `expires_at`（作成から3日後）を追加。

### テスト・ビルド
- `npm run build`: 成功（エラー0）。
- `npm test`: 45/45 通過。`scheduled-post` テストの `rand()` 消費カウント調整あり。

## 2026-05-04 Phase 4: 体験候補投稿フロー

- `src/experience-pick.ts` 新規: `pickExperienceCandidate` — `status='pending'` かつ `expires_at > now` の候補からランダムに1件選ぶ。
- `src/ai/generate-experience-post.ts` 新規: `generateExperiencePost` — 候補 summary と source_user_id から「かなめがその体験をした」ノートを生成。buildCharacterSystemPrompt 使用、maxTokens: 300, temperature: 0.9。
- `src/scheduled-post.ts`: rate limit チェック直後に「体験候補投稿ガチャ」を挿入。
  - `EXPERIENCE_CANDIDATE_POST_PROBABILITY`（デフォルト0.10）で当選。
  - 当選時: `pickExperienceCandidate` → `generateExperiencePost` → `createNote`（`generated_reason='experience_candidate'`）。
  - 成功後: `experience_candidates.status` を `executed` に、`experience_logs` に昇格、`last_note_at` を更新。
  - 候補0件の場合: `skip(reason: "no_experience_candidates")`。
- `schema.ts` seed: `EXPERIENCE_CANDIDATE_POST_PROBABILITY = 0.10` 追加。
- 既存テスト（`scheduled-post.test.ts`）の `rand()` 消費カウントを体験候補ガチャ分だけ調整。

## 2026-05-04 Phase 6（rate limit 部分）: 投稿レート制限

- `src/rate-limit.ts` 新規: `checkNotesPerHour` / `checkNotesPerDay` / `checkQuoteRenotesPerDay` を実装。posts テーブルの `posted_at` カウントによる判定。
- `src/scheduled-post.ts`: 睡眠フロー直後に rate limit チェックを挿入。`NOTES_PER_HOUR`(5) / `NOTES_PER_DAY`(50) / `QUOTE_RENOTES_PER_DAY`(5) を `m_runtime_setting` から読む。超過時は `skip(reason: "rate_limit", scope: ...)`。
- `srcx/test/rate-limit.test.ts` 新規: `checkNotesPerHour` / `checkNotesPerDay` / `checkQuoteRenotesPerDay` の単体テスト4件。

## 2026-05-04 Phase 5（一部）+ Phase 6 rate limit 完結

### P5-1/P5-2 確認済み（実装済み）
- `generate-post.ts` に `experience_logs` ランダムサンプル注入 + weight 段階制御が既に実装されていることを確認。

### P5-4/P5-5: daily-cleanup DB バッチ追加
- `daily-cleanup.ts` を大幅リファクタ。`db?: DbClient` を受け取るように変更。
- `expireOldCandidates`: `status='pending'` かつ `expires_at < now` の `experience_candidates` を `expired` に更新。
- `deleteOldSourceNotes`: `captured_at < 30日前` の `source_notes` を削除（デフォルト30日、オプション変更可能）。
- `app.ts`: `dailyCleanupOnce` から `db` を渡すように変更。
- `srcx/test/daily-cleanup.test.ts` 新規（3テスト）。

### P6-3: probe rate limit
- `rate-limit.ts` に `checkUserTriggeredPer5Min` 追加: `reply_logs.replied_at` の5分以内カウント。
- `probe.ts` の `handleReplyProbe` に `userTriggeredPer5MinLimit?: number` オプション追加。超過時は `poll.skip(reason: "user_triggered_rate_limit")` を返して早期リターン。
- `app.ts`: `USER_TRIGGERED_POSTS_PER_5MIN` を `handleReplyProbe` に渡すように変更。
- `srcx/test/rate-limit.test.ts` に3テスト追加（合計7件）。
- `srcx/test/probe.test.ts` にスキップケース1テスト追加（合計11件）。

合計: 65件 / 65件通過。

## 2026-05-04 rate limit 修正 + imp/user ドキュメント整理

### rate limit 修正

- `QUOTE_RENOTES_PER_DAY` が上限到達時に通常ノートまで止めていた問題を修正。
- `scheduled-post.ts` の引用RN日次上限チェックを、行動ガチャ後の `draw.tag === "quote_rn"` ルート内へ移動。
- `srcx/test/scheduled-post.test.ts` に、引用RN上限超過中でも通常ノートは投稿できる回帰テストを追加。
- `Dockerfile` に `sqlite3` CLI を追加。

### ドキュメント整理

- `imp-wait.md` を廃止し、実装待ちは `imp-tasks.md` に移行。
- ユーザー判断待ちは新規 `user-judge.md` に分離。
- ユーザー確認・運用操作は `user-tasks.md` に整理。
- `exp-plan.md` を `imp-exp-plan.md` に改名。
- `impl-tonight.md` を `imp-instructions-20260503.md` に改名。
- `adjust-tasks.md` / `tasks-now.md` は内容を `imp-tasks.md` / `user-judge.md` / `user-tasks.md` に統合して削除。
- `docs/imp/README.md`, `AGENTS.md`, `PROJECT.md` の読み込み先を現行構成へ更新。

### 検証

- `npm test`: 69件通過。
- `npm run build`: 成功。
- `docker compose up -d --build`: 成功。



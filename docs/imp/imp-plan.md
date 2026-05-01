# Implementation Plan

## 設計済み

- `exp-plan.md`: フォロワー同意、TL観測、体験候補、体験ログ、30分投稿を含む疑似生活体験の実装計画。
- `imp-judge-ai.md`: AI判定とロジック判定の境界。
- `emotion-assets.md`: 投稿へのエモーション画像添付仕様。

## 実装フェーズ

### Phase 1: ローカル常駐bot土台

- Docker Compose構成作成。
- SQLite導入。
- DB schema作成。
- `.env` にMisskey tokenを置く。
- Misskey API client作成。
- 投稿APIの疎通確認。
- Docker Desktop上で常駐起動し、`restart: unless-stopped` で復旧させる。
- ログとSQLite DBをホスト側volumeに保存する。
- ワンショット定期処理CLIを作成。
- Docker常駐プロセス内で5分ごとの投稿抽選を実行する。

### Phase 2: 同意管理

- フォロー通知検知。
- フォローお礼と許可依頼リプライを投稿。
- 依頼ノートへの❤リアクションを検知。
- `experience_source_consents` に許可済みユーザーを保存。
- 「やめて」などのオプトアウトを処理。

### Phase 3: TL観測（MVP実装）

- `notes/timeline` でホームTL取得（limit=20）。
- CW・NSFW・空テキスト・pure renoteを除外して `source_notes` に保存（text_summaryのみ、本文全体は保存しない）。
- TL観測用プロンプト（`generate-tl-post.ts`）でAI生成。
- 行動ガチャ: 5分tickで「TL観測ノート(20%) OR 通常ノート(既存確率テーブル) OR skip」の排他抽選。
- TL観測ノートは `posts.kind = 'tl_observation'` で保存。通常ノートの `min_interval` タイマーに影響しない。
- AI安全分類・`tl_observations` テーブルへの保存はPhase 4で実施。
- キャラクター仕様をAI間で共通化: `src/ai/character-spec.ts`。
- API呼び出しを共通化: `src/ai/chat-api.ts`。

### Phase 2 (追加): お題・口調ガチャの改善

現在の `src/note-hint.ts` はコード内固定リスト。実運用後に以下を段階的に改善する。

- お題リストを DB マスタ（`m_runtime_setting` または専用テーブル）に移行する。
- 口調リストも DB 管理にして bot 管理画面から変更できるようにする。
- 直近投稿のお題カテゴリを記録し、同カテゴリの連続を避ける重みづけを追加する。
- 時間帯（朝・昼・夜・深夜）ごとにお題の出現確率を調整する（例：「カップ麺」は深夜に出やすく）。
- 実投稿を見てユーザーがお題リストを添削できる仕組み（P2 GUI と合わせて）。

### Phase 4: 体験候補

- 許可済みユーザーのnoteを優先探索。
- 許可済みユーザーが見つからない場合、最大10回まで探索。
- AI分類で危険話題、個人情報、重い話題、揉め事、CW/NSFW相当を除外する。
- `experience_candidates` に保存。
- 候補段階では体験記憶にしない。

### Phase 5: 体験投稿と記憶化

- 未使用の `experience_candidates` から投稿候補を選ぶ。
- `post-draw` 定期処理で体験として実行する内容をノートする。
- 投稿成功時のみ `experience_logs` に保存。
- 引用Renoteの使用可否を判定。
- 投稿履歴を保存。

### Phase 6: 安定化

- 重複防止。
- rate limit対応。
- error backoff。
- AI使用量の日次上限、fallback使用量上限、失敗時skipを実装。
- ログ整備。
- 再起動時の復旧。

### Phase 6.5: AI provider運用

- `.env.local` にはAI API keyだけを入れる。
- provider、model id、timeout、retry、token上限、temperature、日次上限、fallback方針はDBマスタで管理する。
- Chutesは `moonshotai/Kimi-K2.5-TEE` を初期モデルにする。
- OpenAI fallbackは `gpt-5.4-mini` を初期モデルにする。
- 初期値はmigrationでDBへ投入し、P1/P2でGUIから編集できるようにする。
- providerごとにtoken上限パラメータ名を切り替える。
- Chutesで `message.content` が空、`finish_reason = length`、JSON parse不能の場合は失敗扱いにしてOpenAIへfallbackする。
- `message.reasoning` / `message.reasoning_content` はログ本文や投稿に使わない。

### Phase 7: エモーション画像添付

- `m_emotion_asset` 定義。
- Misskey Drive upload。
- 投稿時の `fileIds` 添付。
- 直近使用履歴による連続使用回避。

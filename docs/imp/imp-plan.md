# Implementation Plan

## 設計済み

- `exp-plan.md`: フォロワー同意、TL観測、体験候補、体験ログ、30分投稿を含む疑似生活体験の実装計画。

## 実装フェーズ

### Phase 1: ローカル常駐bot土台

- SQLite導入。
- DB schema作成。
- `.env` にMisskey tokenを置く。
- Misskey API client作成。
- 投稿APIの疎通確認。
- Windows上での常駐起動方式を決める。

### Phase 2: 同意管理

- フォロー通知検知。
- フォローお礼と許可依頼リプライを投稿。
- 依頼ノートへの❤リアクションを検知。
- `experience_source_consents` に許可済みユーザーを保存。
- 「やめて」などのオプトアウトを処理。

### Phase 3: TL観測

- ホームタイムライン取得。
- 個人を特定しないTL観測へ抽象化。
- 安全判定。
- `tl_observations` に保存。
- TL観測投稿を生成。

### Phase 4: 体験候補

- 許可済みユーザーのnoteを優先探索。
- 許可済みユーザーが見つからない場合、最大10回まで探索。
- 安全判定。
- `experience_candidates` に保存。
- 候補段階では体験記憶にしない。

### Phase 5: 体験投稿と記憶化

- 未使用の `experience_candidates` から投稿候補を選ぶ。
- 30分投稿で体験として実行する内容をノートする。
- 投稿成功時のみ `experience_logs` に保存。
- 引用Renoteの使用可否を判定。
- 投稿履歴を保存。

### Phase 6: 安定化

- 重複防止。
- rate limit対応。
- error backoff。
- ログ整備。
- 再起動時の復旧。

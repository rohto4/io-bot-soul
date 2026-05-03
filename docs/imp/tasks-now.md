# 整合性タスク（2026-05-04）

調査で判明した「コードは実装済みだがドキュメント・テストが追いついていない」状態を解消する。

## T1: imp-wait.md の完了チェック更新

完了済みなのに `[ ]` のままになっている項目を `[x]` にする。

対象:
- P4-1: EXPERIENCE_CANDIDATE_POST_PROBABILITY seed 追加
- P4-2: schema.ts seedRuntimeSettings への追加
- P4-3: src/experience-pick.ts 実装
- P4-4: src/ai/generate-experience-post.ts 実装
- P4-5: scheduled-post.ts に体験候補ガチャ追加
- P4-6: scheduled-post.test.ts の rand() 消費調整
- P6-1: src/rate-limit.ts 実装（checkNotesPerHour/Day/QuotePerDay）
- P6-2: scheduled-post.ts に rate limit チェック挿入
- P6-4: srcx/test/rate-limit.test.ts 実装

## T2: imp-comp.md に Phase 4 / Phase 6 rate limit の完了記録を追加

imp-comp.md 末尾に以下を追記:
- `## 2026-05-04 Phase 4: 体験候補投稿フロー`
- `## 2026-05-04 Phase 6（一部）: rate limit 実装`

## T3: schema.ts の description 修正

`NOTES_PER_HOUR` / `NOTES_PER_DAY` / `QUOTE_RENOTES_PER_DAY` の description が
「Phase 6で実装予定、現在未適用」のままになっているので実際の状態に修正する。

## T4: srcx/test/experience-pick.test.ts 作成（P4-7）

`pickExperienceCandidate` の単体テスト:
- status='pending' かつ expires_at 未来 → 返す
- status='executed' → 返さない
- expires_at 過去 → 返さない
- 複数件あるとき RANDOM()（ランダム性は型だけ確認）

## T5: srcx/test/scheduled-post-experience.test.ts 作成（P4-8）

体験候補ガチャの統合テスト:
- 候補あり + rand() が EXPERIENCE_CANDIDATE_POST_PROBABILITY 未満 → 投稿・experience_logs 記録
- 候補なし → skip(reason: no_experience_candidates)
- ガチャ外れ → 通常フローへ

## T6: 全変更をコミット

新規・修正ファイルをまとめてコミット。

# Spec Summary

## 確定方針

- 実行環境は、ローカルPC常駐（Docker Compose）で運用中。
- 投稿判定は5分間隔を基本とする。
- 直前ノートからの経過時間に応じて投稿確率を上げる。
- 通知・リプライ・リアクション確認は、1分pollingで行う。
- Misskey Streaming APIは、polling実装が安定した後の改善候補にする。
- DBはSQLite（開発）またはNeon/Postgres（本番）を使い、`DATABASE_PROVIDER` で切り替える。
- DBアクセス層は薄く分け、SQLite固定の書き方をbot全体に散らさない。
- タイムライン由来の材料は、`tl_observations`、`experience_candidates`、`experience_logs` に分ける。
- `tl_observations` は、個人を特定しないTL観測として扱う。許可は不要だが、安全判定は必須。
- `experience_candidates` は、許可済みユーザーの投稿から作る体験候補。まだ体験として記憶しない。**未実装（Phase 4）**。
- `experience_logs` は、botが実際にノートした後だけ保存する体験記憶。引用RN成功時に記録済み。
- 同意説明の正本はピン留めノートに置く。
- フォロワー投稿を引用RNや体験候補に使う場合は、ピン留めノートへの❤リアクションによる明示同意を取る。
- プロフィールとピン留めノートに、botの仕組み、参考にする範囲、`/stop`、`/unfollow` を書く。
- `/stop` はリプライや引用RNなどの接触停止、`/unfollow` はbot側からのフォロー解除とノート参照対象からの除外として扱う。
- 容姿の基本画像は `images/CoffeeBean_V1_2_2026-04-30-23-42-08.png` を正とし、容姿解釈・画像生成・添付判断で参照する。
- 定期ノート投稿は `SCHEDULED_POSTING_ENABLED=true` の時だけ行い、現行実装は `public` visibilityで投稿する。
- 定期ノートは直近通常投稿から5分未満なら必ずskipし、5分以上なら確率抽選に入る。
- 投稿確率の目安は5分後10%、10分後15%、30分後80%、1時間超95%。
- 投稿実行ルールと投稿内容ルールは、Mermaidフロー付きの専用仕様に分離する。
- AI生成・分類はChutesをprimary（`moonshotai/Kimi-K2.5-TEE`）、OpenAIをfallback（`gpt-4o-mini`）として扱う。
- 現行の定期投稿本文はAI生成を優先し、AI失敗時は設定に従ってskipまたは固定テンプレートfallbackにする。
- AI API keyはsecretとして扱い、投稿確率、最短投稿間隔、provider設定やtoken上限などの非secret設定はDBマスタ `m_runtime_setting` で管理する。
- ChutesのKimi系モデルは内部推論で `reasoning_tokens` を消費するため、短文分類でもtoken上限を小さくしすぎない（`AI_CLASSIFIER_MAX_TOKENS=300`）。
- **行動ガチャ**（5分tick）でTL観測・引用RN・通常ノートを排他抽選。TL観測当選時は通常ノートへ落ちない。
- **記憶深度ガチャ**: normal 90% / reminisce 5% / reference 5%
- **お題・口調・文体ガチャ**: 20種 × 6種 × 4種 の組み合わせ
- **beta-test1モード**: DBマスタ `BETA_TEST1_ENABLED` でTL観測80%/引用RN25%/通常ノート経過時間5倍に切り替え

## フェーズ進捗

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1 | Docker常駐土台、SQLite/Postgres、基本投稿 | ✅ 完了 |
| Phase 2 | 同意管理（フォロー返し・ピン留め案内・❤検知） | ✅ 完了 |
| Phase 3 | TL観測・行動ガチャ・引用RN・AI投稿改善・多様性制御 | ✅ 完了 |
| Phase 4 | 体験候補蓄積フロー（`experience_candidates`） | 🔄 未実装 |
| Phase 5 | 体験投稿と記憶化（`experience_logs` 本格活用） | 🔄 未実装 |
| Phase 6 | rate limit・error backoff・AI日次上限 | 🔄 未実装 |
| Phase 7 | エモーション画像添付 | 🔄 未実装 |
| Phase 2追加 | NoteHintのDBマスタ移行・時間帯重みづけ | 🔄 未実装 |

## 仕様ファイル

- `base-personal.md`: ノートの性格・口調・距離感に関する採用仕様。
- `teck-stack.md`: misskey.io botの実行環境、常駐方式、スケジューリング、Misskey API / Streaming APIに関する判断資料。
- `memory-db.md`: 疑似生活ログ、記憶、処理済みID、投稿履歴を保存するDB方針。**実装済みテーブルと未実装テーブルを明記**。
- `db-schema.md`: SQLite/Postgresのschema。rate limit、同意、TL観測、体験候補、体験記憶、投稿履歴を定義。
- `emotion-assets.md`: `images/` 配下のエモーション画像を投稿に添付するP1/P2仕様。
- `posting-runtime-rules.md`: 投稿できる時間、skip条件、安全スイッチ、DB調整値を定義。
- `posting-content-rules.md`: 投稿される内容タイプ、現行テンプレート、将来候補、確率を定義。**実装済み機能を明記**。
- `consent-experience-strategy.md`: フォロワー同意に基づいて投稿を疑似生活体験へ変換する戦略。**5分行動ガチャの実装を反映**。
  - TL観測として個人を特定せず「何々をしている人がいた、いいなー」と扱う場合は許可不要。ただし安全判定は必須。
- `release-readiness.md`: 公開運用前の必須ゲートとリリース可否判断。**Alpha運用中・Phase 3完了を反映**。
- `action-flow.md`: 5分post-draw・行動ガチャ・1分pollingのフローをMermaidで記録。
- `beta-test1.md`: beta-test1モードの仕様（TL観測80%/引用RN25%/通常ノート経過時間5倍）。

## 主要実装ファイル対応表

| 機能 | 実装ファイル | 状態 |
|---|---|---|
| 5分post-draw・行動ガチャ | `src/scheduled-post.ts` | ✅ 実装済み |
| TL観測ノート生成 | `src/ai/generate-tl-post.ts` | ✅ 実装済み |
| 引用RN候補選定 | `src/quote-pick.ts` | ✅ 実装済み |
| AI安全判定 | `src/ai/classify-quote-safety.ts` | ✅ 実装済み |
| 引用コメント生成 | `src/ai/generate-quote-post.ts` | ✅ 実装済み |
| 通常ノート生成 | `src/ai/generate-post.ts` | ✅ 実装済み |
| キャラクター仕様 | `src/ai/character-spec.ts` | ✅ 実装済み |
| AI API共通 | `src/ai/chat-api.ts` | ✅ 実装済み |
| お題・口調・文体ガチャ | `src/note-hint.ts` | ✅ 実装済み |
| TLスキャン | `src/tl-scan.ts` | ✅ 実装済み |
| フォロー・リプライ・❤処理 | `src/probe.ts` | ✅ 実装済み |
| 設定読み込み | `src/runtime-settings.ts` | ✅ 実装済み |
| Misskey API Client | `src/misskey/client.ts` | ✅ 実装済み |
| DB Client | `src/db/client.ts` | ✅ 実装済み |
| DB Schema | `src/db/schema.ts` | ✅ 実装済み |

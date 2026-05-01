# io-bot-soul Project Context

## 目的

misskey.io に bot としてアカウントを作成・運用するための、キャラクターの魂を構成する。

ここでいう「魂」は、単なるプロンプトではなく、botの人格・価値観・話し方・投稿方針・返信方針・禁止事項・運用判断を含む設計資産として扱う。

## 現在のフェーズ（2026-05-02時点）

**Phase 3 MVP完了・実稼働中。**

- Node.js/TypeScript + Docker Compose でローカル常駐稼働中。
- 毎分polling: フォロー返し、リプライ定型返信、`/stop`・`/unfollow`、ピン留め同意ノートの❤確認。
- 5分ごとの行動ガチャ:
  - TL観測ノート（20%）→ うち1/5（4%）は許可済みユーザーへの引用RN試行
  - 通常ノート（確率テーブル）
- AI生成投稿: Chutes primary（`moonshotai/Kimi-K2.5-TEE`）/ OpenAI fallback（`gpt-5.4-mini`）。
- DB: NeonDB (Postgres)。`DATABASE_PROVIDER` / `DATABASE_URL` で切り替え。
- 引用RNには AI安全判定（classify-quote-safety）を実施。1週間以内のノートのみ対象。

**次セッションの最優先タスク → [`docs/imp/user-tasks.md`](docs/imp/user-tasks.md) を参照。**

主な積み残し:
- Phase 4: 体験候補の蓄積フロー（`experience_candidates`）
- 投稿の多様性・キャラクター反映の継続チューニング

## 主な機能・成果物

- キャラクター設定の整理
- 口調、人格、世界観、記憶方針の設計
- misskey.io 投稿・返信・リアクション方針の策定
- bot実装に渡せる仕様・プロンプト・運用ルールの整備
- 候補案、調査、比較、未決事項の記録

## 優先度モデル

1. `AGENTS.md`: agent共通の最上位ルール
2. `PROJECT.md`: PJ固有の目的、構成、運用方針
3. `docs/guide/`: 採用済みガイド、判断基準
4. `docs/spec/`: 確定仕様、要件、設計前提
5. `docs/candi-ref/`: 候補、調査、比較、未採用案
6. `docs/imp/`: 作業計画、実装メモ、完了記録
7. `docs/diary/`: セッション記録
8. `docs/setting/`: 初期化とテンプレート
9. `.agents/skills/`: 必要時に読むECC由来skill
10. `commands/`: 必要時に読むECC/ecc-expand由来command

## ECCコピー元

- ECC: `G:\devwork\clone-dir\everything-claude-code`
- ecc-expand: `G:\devwork\clone-dir\ecc-expand`

## 取り込み対象skill

- `api-design`
- `backend-patterns`
- `coding-standards`
- `documentation-lookup`
- `product-capability`
- `security-review`
- `tdd-workflow`
- `verification-loop`
- `content-engine`
- `crosspost`

## 取り込み対象command

- `expand-answer.md`
- `prp-plan.md`
- `prp-implement.md`
- `prp-prd.md`

## 運用ルール

- 採用済みルールは `docs/guide/` または `docs/spec/` に移す。
- 未確定の案、比較、調査は `docs/candi-ref/` に置く。
- 一時メモは `docs/memo.md` に置いてよいが、確定したら適切な場所へ移す。
- botの人格・発話・投稿方針に関する決定は、可能な限り理由も残す。
- misskey.io の最新仕様や規約に依存する内容は、必要時に公式情報を確認する。
- 日報でファイルを説明する時は、`[ファイルの意味（日本語優先）](相対パス)` の形にし、リンクラベルにファイル名をそのまま使わない。

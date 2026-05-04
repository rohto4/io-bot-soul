# io-bot-soul Project Context

## 目的

misskey.io に bot としてアカウントを作成・運用するための、キャラクターの魂を構成する。

ここでいう「魂」は、単なるプロンプトではなく、botの人格・価値観・話し方・投稿方針・返信方針・禁止事項・運用判断を含む設計資産として扱う。

## 作業入口

- ユーザー確認・操作 → [`docs/imp/user-tasks.md`](docs/imp/user-tasks.md)
- ユーザー判断待ち → [`docs/imp/user-judge.md`](docs/imp/user-judge.md)
- 実装待ち → [`docs/imp/imp-tasks.md`](docs/imp/imp-tasks.md)

`imp-*` / `user-*` の運用ルールは [`AGENTS.md`](AGENTS.md) を正とする。

## 主な機能・成果物

- キャラクター設定の整理
- 口調、人格、世界観、記憶方針の設計
- misskey.io 投稿・返信・リアクション方針の策定
- bot実装に渡せる仕様・プロンプト・運用ルールの整備
- 候補案、調査、比較、未決事項の記録

## 優先度モデル

1. `AGENTS.md`: agent共通の最上位ルール
2. `PROJECT.md`: PJ固有の目的、構成、運用方針
3. `docs/guide/`: 採用済みの運用手順・復旧手順・作業ガイド
4. `docs/spec/`: 実装や運用の前提として確定した仕様
5. `docs/candi-ref/`: 候補案、比較中の案、未採用案、調査メモ
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

- 採用済みの運用手順は `docs/guide/` に移す。
- 確定仕様、要件、設計前提は `docs/spec/` に移す。
- 未確定の案、比較、調査、未採用案は `docs/candi-ref/` に置く。
- 一時メモは `docs/memo.md` に置いてよいが、確定したら適切な場所へ移す。
- botの人格・発話・投稿方針に関する決定は、可能な限り理由も残す。
- misskey.io の最新仕様や規約に依存する内容は、必要時に公式情報を確認する。
- 日報でファイルを説明する時は、`[ファイルの意味（日本語優先）](相対パス)` の形にし、リンクラベルにファイル名をそのまま使わない。

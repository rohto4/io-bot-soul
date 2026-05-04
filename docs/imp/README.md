# Implementation Docs

`docs/imp/` は、実装状況とユーザー作業を分けて管理する。

## 命名ルール

- `imp-*`: 実装を主語にしたファイル。実装状況、実装計画、実装判断、完了記録を置く。
- `user-*`: ユーザーを主語にしたファイル。ユーザー判断、ユーザー確認、運用操作を置く。
- それ以外のファイルは原則として増やさない。セッション記録は `docs/diary/` に置く。

## ユーザーが見るファイル

- `user-tasks.md`: 実機確認、DB確認、設定変更など、ユーザーが実行する作業。
- `user-judge.md`: visibility、確率、文体、次の優先度など、ユーザーが判断する事項。

## 実装状況を見るファイル

- `imp-tasks.md`: 現在の実装待ちタスクボード。
- `imp-comp.md`: 完了済み作業の記録。
- `imp-plan.md`: フェーズ全体の大枠ロードマップ。
- `imp-exp-plan.md`: 疑似生活体験機能の設計・実装計画。
- `imp-judge-ai.md`: AI判定とロジック判定の切り分け。
- `imp-instructions-20260503.md`: 2026-05-03夜の実装指示書。履歴用。

## 現在の読み方

1. ユーザーが次に見るもの: `user-tasks.md` / `user-judge.md`
2. 実装者が次に見るもの: `imp-tasks.md`
3. 完了済み確認: `imp-comp.md`
4. 設計背景確認: `imp-plan.md` / `imp-judge-ai.md` / `docs/spec/*`


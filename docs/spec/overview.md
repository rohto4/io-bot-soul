# Specification Overview

io-bot-soul の確定仕様を読むための入口。

このファイルには現状スナップショットやフェーズ進捗を置かない。現在の実装待ちは `docs/imp/imp-tasks.md`、完了記録は `docs/imp/imp-comp.md` を正とする。

## 仕様の分担

- `base-personal.md`: キャラクターの人格、口調、価値観、距離感。
- `behavior-action-flow.md`: 行動ガチャ、5分post-draw、通常ノート・引用RN・TL参照の流れ。
- `behavior-posting-runtime.md`: 投稿可否、skip条件、rate limit、安全スイッチ。
- `behavior-posting-content.md`: 投稿内容タイプ、テンプレート、AI生成の優先順位。
- `behavior-sleep.md`: 就寝・起床・寝言の状態遷移とAI生成仕様。
- `behavior-experience-classifier.md`: 体験候補AI判定のOK/NG基準。
- `data-schema.md`: DB schema。
- `data-runtime-settings.md`: 環境変数と `m_runtime_setting` の設定値。
- `data-memory.md`: `experience_candidates` / `experience_logs` / `source_notes` などの記憶DB方針。
- `safety-consent.md`: 同意、停止、体験化の安全設計。
- `safety-release.md`: 公開運用前の必須ゲートとリリース判断。
- `emotion-assets.md`: エモーション画像添付仕様。
- `teck-stack.md`: 技術スタック、AI provider、Docker/Postgres等の採用判断。
- `legacy-flows.md`: 旧フローや履歴的なMermaid図。現行実装の正は `behavior-*` 系。

## 仕様更新の原則

- コードが従うべきルールは `docs/spec/` に置く。
- 手順やコマンドは `docs/guide/` に置く。
- 候補・比較・未採用案は `docs/candi-ref/` に置く。
- 実装状況、実装待ち、完了記録は `docs/imp/` に置く。

## 注意

- `docs/spec/base-personal.md` は `src/ai/character-spec.ts` から実行時に読み込まれるため、移動・改名する場合はコードも同時に変更する。
- misskey.io の規約、API制限、公開投稿としての安全性に依存する仕様は、必要時に公式情報を確認してから更新する。



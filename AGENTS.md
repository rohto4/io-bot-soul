# io-bot-soul Agent Instructions

## 最優先ルール

1. 日本語で対応する。
2. すべてのファイルは UTF-8 として読み書きする。
3. 文字化けしたテンプレートをそのまま展開しない。意図と構成を保って、日本語の文書として作り直す。
4. secret、トークン、Cookie、未公開の認証情報をリポジトリに書かない。
5. misskey.io の規約、API制限、公開投稿としての安全性を常に考慮する。

## PJの扱い

このPJは、misskey.io に bot として作成・運用するアカウントの「キャラクターの魂」を構成するためのリポジトリです。

主に次を管理します。

- キャラクター設定、人格、口調、価値観
- 投稿方針、返信方針、禁止事項
- botとしての振る舞い仕様
- 実装候補、調査メモ、運用ガイド
- セッションごとの作業記録

## 読み込み順

1. `AGENTS.md`
2. `PROJECT.md` ← 現在のフェーズと次タスクへのポインタがある
3. `docs/imp/user-tasks.md` ← 次にやることはここ
4. 必要に応じて `docs/imp/imp-wait.md`（未解決課題）
5. 必要に応じて `docs/imp/imp-comp.md`（完了記録）
6. 必要に応じて `docs/ecc-io-bot-soul-setup.md`
7. 必要に応じて `.agents/skills/*/SKILL.md`
8. 必要に応じて `commands/*.md`

## OpenCode設定の持ち込み

次以降のPJで、`docs/guide/opencode/` 配下に次のファイル・フォルダが置かれている場合は、初期処理として `docs/guide/opencode/oc-active-init.md` を読む。

- `docs/guide/opencode/oc-active-init.md`
- `docs/guide/opencode/project-root/`
- `docs/guide/opencode/project-dot-opencode/`
- `docs/guide/opencode/global-config/`

`oc-active-init.md` は、OpenCode / oh-my-openagent / Chutes 用設定を正しい場所へ配置するためのAI向け手順書として扱う。
グローバルセットアップ（全マシン一度）とPJごとのセットアップの2段階に分かれている。
既に完了しているかどうかを自動検出してからスキップまたは実行する。
この処理では secret やAPIキーを書き込まず、既存設定がある場合はバックアップしてから配置する。

## 情報の置き場所

- `docs/guide/`: 採用済みの運用ガイド、判断基準、ルール補足
- `docs/spec/`: 確定した仕様、要件、設計前提
- `docs/candi-ref/`: 候補、調査、比較、未採用案
- `docs/imp/`: 実装メモ、作業計画、完了記録、ユーザー作業
- `docs/diary/`: セッション単位の作業記録
- `docs/setting/`: 初期化用テンプレート、設定資料

## 回答方針

- 通常回答は短く、結論と次の行動を優先する。
- 詳細説明、比較、展開を求められた場合だけ十分に掘り下げる。
- bot運用に関わる判断では、公開SNSでの誤解、迷惑行為、規約違反、個人情報、権利侵害のリスクを明示する。
- 不確かな最新情報、misskey.io の現行仕様、API仕様、規約は確認してから扱う。

## ECCの扱い

- ECC由来のskillは `.agents/skills/` にコピー済みのものを優先して使う。
- ECC全体、hooks、`.codex/config.toml` は標準では導入しない。
- `commands/` はECCまたはecc-expand由来の試用command置き場として扱う。

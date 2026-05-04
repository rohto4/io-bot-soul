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
3. `docs/imp/user-tasks.md` ← ユーザーが次に確認・操作すること
4. 必要に応じて `docs/imp/user-judge.md`（ユーザー判断待ち）
5. 必要に応じて `docs/imp/imp-tasks.md`（実装待ちタスク）
6. 必要に応じて `docs/imp/imp-comp.md`（完了記録）
7. 必要に応じて `docs/ecc-io-bot-soul-setup.md`
8. 必要に応じて `.agents/skills/*/SKILL.md`
9. 必要に応じて `commands/*.md`

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

- `docs/guide/`: 採用済みの運用手順・復旧手順・作業ガイド。ローカル実行、Docker、ログ監視、DB確認、ツール設定配置など。
- `docs/spec/`: 実装や運用の前提として確定した仕様。人格、投稿、返信、睡眠、記憶、DB、設定値、安全・同意・公開運用ゲートなど。
- `docs/candi-ref/`: 候補案、比較中の案、未採用案、調査メモ。採用が決まった内容は `docs/spec/` または `docs/guide/` に移す。
- `docs/imp/`: 実装メモ、作業計画、完了記録、ユーザー作業
- `docs/diary/`: セッション単位の作業記録
- `docs/setting/`: 初期化用テンプレート、設定資料

各フォルダの運用:

- `docs/guide/`, `docs/spec/`, `docs/candi-ref/`, `docs/imp/` の直下は、それぞれ最大10ファイル程度を目安にする。
- ただし、異なる責務を無理に統合して巨大化する場合は、10ファイル制約よりも「1ファイル1責務」を優先する。
- 細かいファイルを増やす前に、既存テーマのファイルへ統合できるかを確認する。
- 確定仕様は `docs/spec/`、採用済み手順は `docs/guide/`、未確定候補は `docs/candi-ref/`、実装作業は `docs/imp/` に置く。
- セッション記録や引き継ぎは `docs/diary/` に置く。

## `docs/imp/` の命名と運用

今後のPJでも、実装主体とユーザー主体をファイル名で分ける。

- `imp-*`: AI/実装者が見る・更新するファイル。実装状況、実装待ち、実装方針、完了記録、技術判断を置く。
- `user-*`: ユーザーが見る・更新判断するファイル。ユーザー作業、実機確認、運用操作、判断待ちを置く。
- ユーザーが見るべきものは `user-*` だけで把握できる状態にする。
- 実装者が見るべきものは `imp-*` だけで把握できる状態にする。
- セッション記録や引き継ぎは `docs/diary/` に置き、`docs/imp/` 直下に一時的な handoff / tasks-now のような曖昧なファイルを増やさない。

実装者の基本読み順:

1. `docs/imp/imp-tasks.md`（実装待ち）
2. 必要に応じて `docs/imp/imp-plan.md`（大枠計画）
3. 必要に応じて `docs/imp/imp-judge-ai.md`（AI/ロジック境界）
4. 必要に応じて `docs/spec/*`（確定仕様）
5. 完了確認として `docs/imp/imp-comp.md`

実装時の更新先:

- 実装待ちの状態変更: `docs/imp/imp-tasks.md`
- 完了記録: `docs/imp/imp-comp.md`
- 実装方針やロードマップ変更: `docs/imp/imp-plan.md`
- AI/ロジック境界の判断変更: `docs/imp/imp-judge-ai.md`
- 確定仕様: `docs/spec/*`
- ユーザー判断が必要になったもの: `docs/imp/user-judge.md`
- ユーザーに実機確認してほしいもの: `docs/imp/user-tasks.md`
- セッション記録・引き継ぎ: `docs/diary/*`

判断待ちの扱い:

- 実装中にユーザー判断が必要と分かったものは、`imp-tasks.md` に曖昧に残さず `user-judge.md` に移す。
- ユーザー判断が済んで実装可能になったら、必要な作業だけ `imp-tasks.md` に戻す。
- ユーザーの操作・確認だけで済むものは `user-tasks.md` に置き、`imp-tasks.md` には置かない。

## 回答方針

- 通常回答は短く、結論と次の行動を優先する。
- 詳細説明、比較、展開を求められた場合だけ十分に掘り下げる。
- bot運用に関わる判断では、公開SNSでの誤解、迷惑行為、規約違反、個人情報、権利侵害のリスクを明示する。
- 不確かな最新情報、misskey.io の現行仕様、API仕様、規約は確認してから扱う。

## ECCの扱い

- ECC由来のskillは `.agents/skills/` にコピー済みのものを優先して使う。
- ECC全体、hooks、`.codex/config.toml` は標準では導入しない。
- `commands/` はECCまたはecc-expand由来の試用command置き場として扱う。

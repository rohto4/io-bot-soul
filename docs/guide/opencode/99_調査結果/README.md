# OpenCode 設定ファイル

OpenCode / oh-my-openagent / Chutes を動かすための設定ファイル一式です。
新しい PJ への適用手順は [`oc-active-init.md`](../oc-active-init.md) を参照してください。

## ファイル構成と配置先

| このディレクトリ内 | 配置先 | 役割 |
|---|---|---|
| `global-config/opencode.json` | `$HOME/.config/opencode/opencode.json` | 全PJ共通: plugin + Chutes provider + デフォルトモデル |
| `project-root/opencode.jsonc` | `PROJECT_ROOT/opencode.jsonc` | PJごと: `enabled_providers` 絞り込み + compaction |
| `project-dot-opencode/opencode.json` | `PROJECT_ROOT/.opencode/opencode.json` | PJごと: plugin エントリ（グローバルの補完） |
| `project-dot-opencode/oh-my-openagent.jsonc` | `PROJECT_ROOT/.opencode/oh-my-openagent.jsonc` | PJごと: カスタムエージェント定義 |
| `project-dot-opencode/package.json` | `PROJECT_ROOT/.opencode/package.json` | PJごと: OpenCode プラグインフレームワーク依存 |

## グローバル設定が持つもの（2026-05-02 以降）

`global-config/opencode.json` には以下が含まれています。

- `"plugin": ["oh-my-openagent@latest"]` — 全PJで自動ロード
- Chutes プロバイダー定義（全モデル）
- `"model": "chutes/qwen3-32b-tee"` / `"small_model": "chutes/gemma-3-4b"`

グローバル設定が正しく適用されている場合、`opencode debug config` で `plugin_origins.scope=global` になります。

## CHUTES_API_KEY

`{env:CHUTES_API_KEY}` を使用しています。キーは Windows ユーザー環境変数 (`HKCU\Environment`) に登録が必要です。ファイルには含めません。

## 調査ログ

- [`investigation-20260501.md`](investigation-20260501.md) — 名称移行・初期検証
- [`investigation-20260502.md`](investigation-20260502.md) — グローバル設定不動作の原因と修正

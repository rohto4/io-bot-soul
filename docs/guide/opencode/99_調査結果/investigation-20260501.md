# OpenCode / oh-my-openagent 調査結果 2026-05-01

## 名称移行

- 公式リポジトリは `code-yeongyu/oh-my-openagent`。
- npm パッケージは `oh-my-openagent` と旧名 `oh-my-opencode` の両方が存在する。
- 2026-05-01 時点の npm latest は、どちらも `3.17.12`。
- 公式インストールガイドでは、plugin entry は `oh-my-openagent` を優先し、旧名 `oh-my-opencode` は互換扱いとされている。
- このPJでは plugin entry を `.opencode/opencode.json` の `oh-my-openagent@latest` に統一する。

## 検証結果

- `oh-my-opencode --version`: `3.17.12`
- `oh-my-openagent --version`: `3.17.12`
- npm latest: `oh-my-openagent@3.17.12`
- OpenCode 実効設定: `.opencode/opencode.json` 由来の `oh-my-openagent@latest` を単独ロード。
- OpenCode plugin cache: `C:\Users\unibe\.cache\opencode\package.json` を `oh-my-openagent:^3.17.12` に更新済み。
- Chutes provider: `opencode models chutes` でモデル一覧取得を確認済み。

## doctor の注意点

`oh-my-opencode doctor` は `C:\Users\unibe\.config\opencode\opencode.json` を registration 判定に使うため、PJローカルの `.opencode/opencode.json` だけに plugin entry を置く構成では registration エラーを出す。

ただし `opencode debug config` ではローカル plugin entry が実効設定として解決されているため、OpenCode本体の実行設定としては `.opencode/opencode.json` が有効。

## 2026-05-02 グローバル設定リセット

### 問題

- グローバル `opencode.json` には `plugin` も `provider` もなかったため、io-bot-soul 以外のすべての PJ で oh-my-openagent が動作しなかった（`plugin_origins.scope=local` のみ）。
- `CHUTES_API_KEY` が Windows ユーザー環境変数に未設定。`{env:CHUTES_API_KEY}` が空文字になりすべての Chutes 呼び出しが失敗していた。

### 修正

1. `CHUTES_API_KEY` を `[System.Environment]::SetEnvironmentVariable(..., "User")` でレジストリに登録（`HKCU\Environment`）。新しいターミナルから有効。
2. `C:\Users\unibe\.config\opencode\opencode.json` にグローバル設定を書き込み（旧設定は `.bak-20260502-010448` に退避）:
   - `"plugin": ["oh-my-openagent@latest"]` 追加
   - Chutes プロバイダー全モデル定義を移動
   - `"model": "chutes/qwen3-32b-tee"`, `"small_model": "chutes/gemma-3-4b"` 設定
3. `docs/guide/opencode/global-config/opencode.json` テンプレートを新しい実設定に同期。

### 検証

- `opencode debug config` (HOME から): `plugin_origins.scope=global`, `model=chutes/qwen3-32b-tee` 確認。
- io-bot-soul PJ から: `enabled_providers: {chutes}` が PJ レベルで上書きされ、プラグインは global から読まれる。

## 除外・整理したもの

- `.opencode/oh-my-openagent.jsonc.tmp`
  - 一時ファイル扱いだったため削除済み。
- `.opencode/oh-my-opencode.jsonc`
  - 最新名に合わせて `.opencode/oh-my-openagent.jsonc` へ移行。
- `C:\Users\unibe\.config\opencode\opencode.jsonc`
  - `opencode.jsonc.disabled-20260501-221707` に退避済み。
- バックアップ、無効化済みファイル、node_modules 配下
  - 有効設定としては扱わない。


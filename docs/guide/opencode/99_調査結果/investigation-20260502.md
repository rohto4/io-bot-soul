# OpenCode / oh-my-openagent 不動作 — 調査・原因・対応 2026-05-02

## 症状

- `opencode` を起動しても Chutes モデルへのリクエストがすべて失敗する。
- io-bot-soul PJ だけでなく、他のすべての PJ でも oh-my-openagent のエージェント定義が機能しない。
- グローバルな設定が原因ではないかと疑われた。

---

## 調査手順

### 1. バージョン確認

```powershell
opencode --version        # 1.14.31
oh-my-openagent --version # 3.17.12
oh-my-opencode --version  # 3.17.12 (互換名)
```

いずれもインストール自体は正常。

### 2. opencode debug config で実効設定を確認

```powershell
Set-Location "G:\devwork\io-bot-soul"
opencode debug config | ConvertFrom-Json | Select-Object model, small_model, plugin, plugin_origins, enabled_providers
```

出力:

```
model             : chutes/qwen3-32b-tee
small_model       : chutes/gemma-3-4b
plugin            : {oh-my-openagent@latest}
plugin_origins    : scope=local, source=G:\devwork\io-bot-soul\.opencode\opencode.json
enabled_providers : {chutes}
```

**発見1**: `plugin_origins.scope = local`  
→ プラグインは PJ ローカルの `.opencode/opencode.json` からのみ読まれている。グローバル設定には plugin エントリがないため、他の PJ では oh-my-openagent が一切ロードされない。

**発見2**: `apiKey: ""` (provider.chutes.options より)  
→ `opencode.jsonc` の `{env:CHUTES_API_KEY}` が空文字に解決されている。

### 3. CHUTES_API_KEY の所在を確認

```powershell
$env:CHUTES_API_KEY  # → 空 (現セッション)
[System.Environment]::GetEnvironmentVariable("CHUTES_API_KEY", "User")    # → 空
[System.Environment]::GetEnvironmentVariable("CHUTES_API_KEY", "Machine") # → 空
```

→ `CHUTES_API_KEY` は `.env.local` にのみ存在し、Windows ユーザー環境変数には未登録だった。

### 4. グローバル設定ファイルを確認

`C:\Users\unibe\.config\opencode\opencode.json` の内容:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {}
}
```

**発見3**: `plugin` キーも `provider` キーも存在しない。  
→ OpenCode はグローバル設定から何もロードできない状態だった。

### 5. 旧設定ファイルの確認

`opencode.jsonc.disabled-20260501-221707` (退避された旧グローバル設定) を確認:

- `model: openai/gpt-5.2` — OpenAI OAuth 中心の設定だった。
- `plugin: ["opencode-openai-codex-auth", "oh-my-openagent@3.8.3", "opencode-antigravity-auth@1.6.0"]`
- Chutes プロバイダーの定義はなかった。

→ 旧設定を Chutes 移行のために無効化した際に、グローバル `opencode.json` を空に近い状態にしてしまい、その状態で放置されていた。

---

## 根本原因

| # | 原因 | 影響範囲 |
|---|---|---|
| 1 | `CHUTES_API_KEY` が Windows ユーザー環境変数に未登録 | Chutes を使うすべての PJ で認証失敗 |
| 2 | グローバル `opencode.json` に `"plugin"` エントリがない | io-bot-soul 以外のすべての PJ で oh-my-openagent がロードされない |
| 3 | グローバル `opencode.json` に `"provider"` 定義がない | io-bot-soul 以外では Chutes モデルが利用不可 |

原因 2・3 の背景: 2026-05-01 に旧 OpenAI 中心のグローバル設定を無効化した際、Chutes 設定は PJ ローカルの `opencode.jsonc` にしか存在しなかった。グローバル設定を新しい構成に書き換える作業が未完のまま残っていた。

---

## 対応内容

### 対応 1: CHUTES_API_KEY をユーザー環境変数に登録

```powershell
$key = (Get-Content "G:\devwork\io-bot-soul\.env.local" -Raw) -replace '(?s).*CHUTES_API_KEY=([^\r\n]+).*', '$1'
[System.Environment]::SetEnvironmentVariable("CHUTES_API_KEY", $key.Trim(), "User")
```

- `HKCU\Environment` に書き込み。
- **注意**: 設定後に開いた新しいターミナルから有効になる。現在のセッションの子プロセスには反映されない。
- 確認: `Get-ItemProperty "HKCU:\Environment" | Select-Object CHUTES_API_KEY`

### 対応 2: グローバル opencode.json を全面的に書き換え

`C:\Users\unibe\.config\opencode\opencode.json` を以下の構成で更新（旧設定は `.bak-20260502-010448` に退避）:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "chutes/qwen3-32b-tee",
  "small_model": "chutes/gemma-3-4b",
  "plugin": ["oh-my-openagent@latest"],
  "provider": {
    "chutes": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Chutes",
      "options": {
        "baseURL": "https://llm.chutes.ai/v1",
        "apiKey": "{env:CHUTES_API_KEY}",
        "timeout": 600000,
        "chunkTimeout": 45000
      },
      "models": { ... }
    }
  },
  "compaction": { "auto": true, "prune": true, "reserved": 10000 },
  "mcp": {}
}
```

設計上の判断:
- `"enabled_providers"` はグローバル設定には含めない。制限は PJ ごとの `opencode.jsonc` に委ねる。
- `"plugin": ["oh-my-openagent@latest"]` をグローバルに配置することで `scope=global` になり、すべての PJ で有効になる。
- Antigravity / Anthropic Auth プラグインは現時点では追加しない（必要時に追加可能）。

### 対応 3: テンプレートを同期

`docs/guide/opencode/global-config/opencode.json` を実際のグローバル設定と同内容に更新。
新 PJ への適用手順は `oc-active-init.md` を参照。

---

## 検証結果

**HOME ディレクトリ（任意の PJ 相当）から:**

```powershell
Set-Location "C:\Users\unibe"
opencode debug config | ConvertFrom-Json | Select-Object model, small_model, plugin, plugin_origins
```

```
model            : chutes/qwen3-32b-tee
small_model      : chutes/gemma-3-4b
plugin           : {oh-my-openagent@latest}
plugin_origins   : spec=oh-my-openagent@latest, source=C:\Users\unibe\.config\opencode, scope=global
```

→ `scope=global` を確認。どの PJ でも oh-my-openagent と Chutes が使える状態になった。

**io-bot-soul PJ から:**

```
model             : chutes/qwen3-32b-tee
enabled_providers : {chutes}
plugin_origins    : scope=local (PJローカルの .opencode/opencode.json が優先)
```

→ PJ レベルの設定が上書きされ正常動作。

---

## 今後の注意点

- `CHUTES_API_KEY` を更新した場合は、Windowsレジストリ (`HKCU:\Environment`) の値も更新すること。
- 新しい PJ で Chutes + oh-my-openagent を使う場合、グローバル設定が自動で効くため追加作業は不要。カスタムエージェント定義 (`oh-my-openagent.jsonc`) だけ配置すればよい。
- `oh-my-opencode doctor` はグローバル設定の plugin エントリを見るが、`opencode debug config` の `plugin_origins` が正しければ実動作に問題はない。

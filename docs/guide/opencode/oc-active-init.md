# OpenCode 設定 自動配置マニュアル

このファイルは、新しい PJ で OpenCode / oh-my-openagent / Chutes を動かすための AI 向け手順書です。
セットアップは **Phase 1（全マシン一度だけ）** と **Phase 2（PJ ごと）** の 2 段階です。

---

## 前提

- 日本語で作業する。
- すべてのファイルは UTF-8 として扱う。
- secret / API キー / トークンをリポジトリに書かない。
- 既存ファイルを上書きする前に `.bak-YYYYMMDD-HHMMSS` サフィックスで退避する。
- ユーザーが作業中の変更を勝手に戻さない。

## ファイル構成

このマニュアルと同じディレクトリを `SOURCE` と呼ぶ。

```text
SOURCE/
├── global-config/
│   └── opencode.json          → $HOME/.config/opencode/opencode.json
├── project-root/
│   └── opencode.jsonc         → PROJECT_ROOT/opencode.jsonc
└── project-dot-opencode/
    ├── opencode.json          → PROJECT_ROOT/.opencode/opencode.json
    ├── oh-my-openagent.jsonc  → PROJECT_ROOT/.opencode/oh-my-openagent.jsonc
    └── package.json           → PROJECT_ROOT/.opencode/package.json
```

---

## Phase 1: グローバルセットアップ（全マシン一度だけ）

**既に完了しているか確認する。**

```powershell
$cfg = opencode debug config 2>&1 | ConvertFrom-Json
$globalPlugin = $cfg.plugin_origins | Where-Object { $_.scope -eq "global" -and $_.spec -like "oh-my-openagent*" }
$apiKeySet    = [System.Environment]::GetEnvironmentVariable("CHUTES_API_KEY", "User")

if ($globalPlugin -and $apiKeySet) {
  Write-Host "Phase 1 は完了済みです。Phase 2 へ進んでください。"
} else {
  Write-Host "Phase 1 が必要です。以下の手順を実行してください。"
}
```

`"Phase 1 は完了済みです"` が出た場合は Phase 2 へスキップする。

---

### Step 1-A: CHUTES_API_KEY をユーザー環境変数に登録

> **重要**: API キーをファイルに書いてはいけない。以下のコマンドはユーザーに値を直接入力させる。

```powershell
# ユーザーに API キーを入力させてから登録する。
# AI がキーの値を知る必要はない。ユーザーが自分で実行する。
$key = Read-Host "CHUTES_API_KEY を入力してください（入力は非表示にはなりません）"
[System.Environment]::SetEnvironmentVariable("CHUTES_API_KEY", $key.Trim(), "User")
Write-Host "登録しました。新しいターミナルを開くと有効になります。"
```

確認:
```powershell
[System.Environment]::GetEnvironmentVariable("CHUTES_API_KEY", "User") |
  ForEach-Object { if ($_) { "OK: 長さ $($_.Length) 文字" } else { "未設定" } }
```

> **注意**: 現在のターミナルセッションは登録後も古い環境を持つ。opencode は **新しいターミナルを開いてから起動する**こと。

---

### Step 1-B: グローバル設定ファイルを配置

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$globalDir = "$HOME\.config\opencode"
New-Item -ItemType Directory -Force -Path $globalDir | Out-Null

$dest = Join-Path $globalDir "opencode.json"
if (Test-Path -LiteralPath $dest) {
  Copy-Item -LiteralPath $dest -Destination "$dest.bak-$stamp"
  Write-Host "旧ファイルを退避しました: opencode.json.bak-$stamp"
}
# SOURCE は呼び出し側で解決する。
# 例: $SOURCE = "G:\devwork\some-project\docs\guide\opencode"
Copy-Item -LiteralPath (Join-Path $SOURCE "global-config\opencode.json") -Destination $dest -Force
Write-Host "グローバル設定を配置しました。"
```

確認:
```powershell
opencode debug config 2>&1 | ConvertFrom-Json |
  Select-Object model, small_model, plugin, plugin_origins | Format-List
# plugin_origins.scope が "global" であれば成功。
```

---

## Phase 2: PJ ごとのセットアップ

**既に完了しているか確認する。**

```powershell
# PROJECT_ROOT は実際の PJ ルートに合わせる。
$PROJECT_ROOT = "G:\devwork\new-project"

$hasOc     = Test-Path (Join-Path $PROJECT_ROOT "opencode.jsonc")
$hasPlugin = Test-Path (Join-Path $PROJECT_ROOT ".opencode\oh-my-openagent.jsonc")

if ($hasOc -and $hasPlugin) {
  Write-Host "Phase 2 は完了済みです。"
} else {
  Write-Host "Phase 2 が必要です。"
}
```

---

### Step 2-A: PJ ファイルを配置

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
# SOURCE と PROJECT_ROOT を実際のパスに合わせる。
# $SOURCE = "G:\devwork\some-project\docs\guide\opencode"
# $PROJECT_ROOT = "G:\devwork\new-project"

New-Item -ItemType Directory -Force -Path (Join-Path $PROJECT_ROOT ".opencode") | Out-Null

$copies = @(
  @{ From = Join-Path $SOURCE "project-root\opencode.jsonc";                    To = Join-Path $PROJECT_ROOT "opencode.jsonc" },
  @{ From = Join-Path $SOURCE "project-dot-opencode\opencode.json";             To = Join-Path $PROJECT_ROOT ".opencode\opencode.json" },
  @{ From = Join-Path $SOURCE "project-dot-opencode\oh-my-openagent.jsonc";    To = Join-Path $PROJECT_ROOT ".opencode\oh-my-openagent.jsonc" },
  @{ From = Join-Path $SOURCE "project-dot-opencode\package.json";             To = Join-Path $PROJECT_ROOT ".opencode\package.json" }
)

foreach ($copy in $copies) {
  if (Test-Path -LiteralPath $copy.To) {
    Copy-Item -LiteralPath $copy.To -Destination "$($copy.To).bak-$stamp"
  }
  Copy-Item -LiteralPath $copy.From -Destination $copy.To -Force
  Write-Host "配置: $($copy.To)"
}
```

---

## 検証

```powershell
Set-Location $PROJECT_ROOT

# 実効設定を確認する。
$cfg = opencode debug config 2>&1 | ConvertFrom-Json
$cfg | Select-Object model, small_model, plugin, enabled_providers | Format-List
$cfg.plugin_origins | Format-List

# Chutes プロバイダーが読めるか確認する。
opencode models chutes | Select-Object -First 5
```

### 成功条件

| 項目 | 期待値 |
|---|---|
| `model` | `chutes/qwen3-32b-tee` |
| `small_model` | `chutes/gemma-3-4b` |
| `plugin` | `oh-my-openagent@latest` |
| `plugin_origins.scope` | `local`（PJ ファイルがあるため） |
| `enabled_providers` | `chutes` |
| `opencode models chutes` | モデル一覧が返ってくる |

> グローバルのみでPJファイルを置かない場合、`plugin_origins.scope` は `global` になる。どちらも動作上は問題ない。

---

## フォールバック構成

oh-my-openagent のエージェントは `.opencode/oh-my-openagent.jsonc` で定義している。  
Chutes が失敗した場合、各エージェントの `fallback_models` に設定した軽量モデル（`chutes/gemma-3-4b` 等）に自動的に切り替わる。

---

## 注意・トラブルシュート

| 状況 | 対処 |
|---|---|
| `opencode models chutes` が空を返す | 新しいターミナルを開き直して再実行。CHUTES_API_KEY が未反映の可能性がある。 |
| `plugin_origins` に oh-my-openagent が出ない | グローバル `opencode.json` に `"plugin"` キーがあるか確認する。 |
| `oh-my-opencode doctor` でエラーが出る | グローバル設定を参照しているため。`opencode debug config` で `scope=global` が出ていれば動作上は問題ない。 |
| 別マシンで使う場合 | Phase 1 からやり直す。`CHUTES_API_KEY` はそのマシンで別途登録が必要。 |

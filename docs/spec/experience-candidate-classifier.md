# 体験候補AI判定仕様

## 概要

`experience_candidates` に保存する候補ノートの安全判定。
引用RN用の `classify-quote-safety.ts`（厳しめ）とは別に、観察・ヒント用のゆるい判定プロンプトを実装する。

## 既存の classifyQuoteSafety との違い

| 項目 | classify-quote-safety | classify-experience-candidate（新規）|
|---|---|---|
| 用途 | 引用RN（元ノートが公開される） | 体験候補（かなめの行動ヒントにするだけ） |
| 判定の厳しさ | 厳しい（引用されるので慎重） | ゆるい（引用しない、雰囲気を参考にするだけ） |
| NG判定の例 | 個人情報・病気・政治・医療・投資 すべて | 重大なプライバシー侵害・深刻な話題のみ |

## 判定基準

### OK（体験ヒントとして採用）

- 日常・趣味・食事・ゲーム・散歩・買い物・創作・作業など
- 感情の軽い表現（楽しい・眠い・疲れた など）
- 季節・天気・時間帯の話題
- 軽い技術・学習の話題
- ミーム・ネットスラングを含む投稿

### NG（候補から除外）

- 個人の氏名・住所・学校・職場が特定できる
- 深刻な病気・事故・死・トラブルの話題
- 激しい感情（怒り・炎上・攻撃）
- 政治・選挙・差別
- 成人向け・NSFW
- 他者へのリプライ文脈が強く文脈なしには意味不明

※ 通常の日常的な軽いネガティブ（「眠い」「疲れた」「失敗した」）は OK。

## AIプロンプト仕様（classify-experience-candidate.ts）

```typescript
// システムプロンプト（固定）
const SYSTEM_PROMPT = `
あなたはテキストの安全性を判定するアシスタントです。
Misskeyのノートを「かなめのキャラクターの日常のヒント」として採用してよいかを判定します。
引用や転載は一切しません。雰囲気や体験のヒントとして参考にするだけです。

OK: 日常・趣味・食事・ゲーム・感情の軽い表現・季節・天気・技術・学習・ミーム
NG: 個人特定情報・深刻な病気/事故/死・激しい怒り/炎上/攻撃・政治・成人向け

「OK」または「NG」の1単語のみで回答してください。
`.trim();

// ユーザーメッセージ
// `以下のテキストを判定してください:\n${text}`

// パラメータ
// maxTokens: 5
// temperature: 0.0
// 失敗時: NG扱い（既存の classifyQuoteSafety と同じ方針）
```

## experience-scan.ts の変更点

### expires_at の追加

体験候補の有効期限 = **作成から3日後**。

```typescript
const expiresAt = new Date(new Date(options.at).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
```

INSERT 時に `expires_at = @expiresAt` を設定する。

### 使用する classifier の変更

```typescript
// 旧
import { classifyQuoteSafety } from "./ai/classify-quote-safety.js";

// 新
import { classifyExperienceCandidate } from "./ai/classify-experience-candidate.js";
```

`classifyQuoteSafety` → `classifyExperienceCandidate` に差し替える。

### source_note_id の仮ID（現状維持）

現状の `tl_${options.at}_${saved}` の仮IDはそのまま維持する（adjust-tasks に課題として記録済み）。

## 新規ファイル・変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src/ai/classify-experience-candidate.ts` | 新規 | ゆるい体験候補安全判定 |
| `src/experience-scan.ts` | 変更 | 新分類器に切り替え + expires_at 追加 |

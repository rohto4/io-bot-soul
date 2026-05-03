# 実装指示書（Codex向け）

作成日: 2026-05-03

このドキュメントは今夜の実装3件の Codex 向け指示書。
設計詳細は各 spec ドキュメントを参照。

---

## タスク①: NoteHint 記憶深度確率 DB移行

### 目的

`note-hint.ts` の `drawMemoryDepth` のハードコード確率（reference 5% / reminisce 5%）を `m_runtime_setting` から読むようにする。

### 変更ファイル

**`src/note-hint.ts`**

1. `drawNoteHint` のシグネチャに `settings?: RuntimeSettings` を追加
2. `drawMemoryDepth` を settings を受け取る形に変更

```typescript
import type { RuntimeSettings } from "./runtime-settings.js";
import { readNumberSetting } from "./runtime-settings.js";

function drawMemoryDepth(rand: () => number, settings?: RuntimeSettings): MemoryDepth {
  const referenceRate = settings ? readNumberSetting(settings, "MEMORY_DEPTH_REFERENCE_RATE", 0.05) : 0.05;
  const reminisceRate = settings ? readNumberSetting(settings, "MEMORY_DEPTH_REMINISCE_RATE", 0.05) : 0.05;
  const r = rand();
  if (r < referenceRate) return "reference";
  if (r < referenceRate + reminisceRate) return "reminisce";
  return "normal";
}

export function drawNoteHint(random: () => number = Math.random, settings?: RuntimeSettings): NoteHint {
  const memoryDepth = drawMemoryDepth(random, settings);
  // ... 残りは変更なし
}
```

**`src/scheduled-post.ts`**

`drawAction` 内の `drawNoteHint(rand)` → `drawNoteHint(rand, settings)` に変更。

**`src/db/schema.ts`**

seedRuntimeSettings に追加:
```typescript
["MEMORY_DEPTH_REFERENCE_RATE", "0.05", "number", "gacha", "記憶深度ガチャのreference確率（過去1件に言及）。"],
["MEMORY_DEPTH_REMINISCE_RATE", "0.05", "number", "gacha", "記憶深度ガチャのreminisce確率（蓄積から連想）。"],
```

### テスト

既存テストがそのまま通ることを確認（settings未指定時はデフォルト値で動作）。

---

## タスク②: 睡眠システム

### 参照ドキュメント

`docs/spec/sleep-system.md` を必読のこと。

### 新規ファイル 1: `src/sleep-schedule.ts`

```typescript
import type { DbClient } from "./db/client.js";
import type { RuntimeSettings } from "./runtime-settings.js";
import { readStringSetting, readIntegerSetting } from "./runtime-settings.js";

const DOW_KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

// HH:MM 文字列と jitter を受け取り、基準日（JST YYYY-MM-DD）から offset 適用済み ISO 文字列を返す
// earlyMorning=true の場合は baseDate + 1日を使う（就寝が日付をまたぐため）
function buildTimestamp(baseDateJst: string, hhMm: string, jitterMinutes: number, rand: () => number): string {
  const [hStr, mStr] = hhMm.split(":");
  let hours = parseInt(hStr ?? "0", 10);
  let minutes = parseInt(mStr ?? "0", 10) + Math.floor((rand() * 2 - 1) * jitterMinutes);
  // 正規化
  while (minutes < 0) { minutes += 60; hours -= 1; }
  while (minutes >= 60) { minutes -= 60; hours += 1; }
  hours = ((hours % 24) + 24) % 24;

  // 06:00 未満は翌日
  const [y, mo, d] = baseDateJst.split("-").map(Number);
  const baseDate = new Date(y!, mo! - 1, d!);
  const originalHours = parseInt(hStr ?? "0", 10);
  if (originalHours < 6) {
    baseDate.setDate(baseDate.getDate() + 1);
  }

  const jstStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+09:00`;
  return new Date(jstStr).toISOString();
}

function jstDateStr(utcDate: Date): string {
  const jst = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function jstDayOfWeek(utcDate: Date): number {
  const jst = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  return jst.getDay(); // 0=Sun
}

export function computeNextSleepAt(settings: RuntimeSettings, now: Date, rand: () => number): string {
  const dow = jstDayOfWeek(now);
  const key = DOW_KEYS[dow]!;
  const timeStr = readStringSetting(settings, `SLEEP_TIME_${key}`, "01:30");
  const jitter = readIntegerSetting(settings, "SLEEP_SCHEDULE_JITTER_MINUTES", 30);
  return buildTimestamp(jstDateStr(now), timeStr, jitter, rand);
}

export function computeNextWakeAt(settings: RuntimeSettings, now: Date, rand: () => number): string {
  // 翌日の曜日の WAKE_TIME を使う
  const dowTomorrow = (jstDayOfWeek(now) + 1) % 7;
  const key = DOW_KEYS[dowTomorrow]!;
  const timeStr = readStringSetting(settings, `WAKE_TIME_${key}`, "07:30");
  const jitter = readIntegerSetting(settings, "SLEEP_SCHEDULE_JITTER_MINUTES", 30);
  // 翌日の日付を baseDate にする
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setDate(jst.getDate() + 1);
  const tomorrowJst = jst.toISOString().slice(0, 10);
  // WAKE_TIME は朝なので earlyMorning フラグ不要（buildTimestamp に originalHours<6 チェックあり）
  // 07:30 は 6以上なので当日扱い → tomorrowJst のまま正しく動作
  return buildTimestamp(tomorrowJst, timeStr, jitter, rand);
}
```

### 新規ファイル 2: `src/ai/generate-sleep-post.ts`

- `buildCharacterSystemPrompt` を `character-spec.ts` からインポート
- `callAiWithFallback` を `chat-api.ts` からインポート
- 3関数を実装: `generateOyasumiPost`, `generateOhayouPost`, `generateMurmurPost`
- 各関数のプロンプト内容は `docs/spec/sleep-system.md` の「AI生成プロンプト仕様」参照
- maxTokens: 300, temperature: 0.9
- 引数: `{ settings, at, chutesApiKey, openaiApiKey, logger }`

### 変更ファイル 1: `src/scheduled-post.ts`

`runScheduledPostDraw` の先頭（`if (!options.enabled)` チェックの直後、settings ロードの後）に睡眠フローを挿入。

```typescript
// 以下を settings ロード後、Phase 1 ガチャの前に挿入

// ===== 睡眠フロー =====
import { computeNextSleepAt, computeNextWakeAt } from "./sleep-schedule.js";
import { generateOyasumiPost, generateOhayouPost, generateMurmurPost } from "./ai/generate-sleep-post.js";
import { readNumberSetting } from "./runtime-settings.js";

type BotStateRow = { sleeping: number; sleep_at: string | null; wake_at: string | null };
const botState = await options.db.get<BotStateRow>(
  "SELECT sleeping, sleep_at, wake_at FROM bot_state WHERE id = 1"
);

// sleep_at が未設定なら今夜の就寝時刻を計算してセット
if (!botState?.sleep_at) {
  const newSleepAt = computeNextSleepAt(settings, new Date(options.at), rand);
  await options.db.run(
    "UPDATE bot_state SET sleep_at = @sleepAt, updated_at = @at WHERE id = 1",
    { sleepAt: newSleepAt, at: options.at }
  );
  // botState に反映
  if (botState) botState.sleep_at = newSleepAt;
}

const now = new Date(options.at);
const sleeping = (botState?.sleeping ?? 0) === 1;

if (sleeping) {
  const wakeAt = botState?.wake_at ? new Date(botState.wake_at) : null;

  if (!wakeAt) {
    // 緊急: wake_at 未設定 → セットして skip
    const newWakeAt = computeNextWakeAt(settings, now, rand);
    await options.db.run("UPDATE bot_state SET wake_at = @wakeAt WHERE id = 1", { wakeAt: newWakeAt });
    options.logger.info("scheduledPost.skip", { at: options.at, reason: "sleeping_no_wake_at" });
    return;
  }

  if (now >= wakeAt) {
    // 起床
    const newSleepAt = computeNextSleepAt(settings, now, rand);
    await options.db.run(
      "UPDATE bot_state SET sleeping = 0, wake_at = NULL, sleep_at = @sleepAt, updated_at = @at WHERE id = 1",
      { sleepAt: newSleepAt, at: options.at }
    );
    const text = await (options.generateText
      ? options.generateText({ tlMode: "no_tl" })
      : generateOhayouPost({ settings, at: options.at, chutesApiKey: process.env.CHUTES_API_KEY, openaiApiKey: process.env.OPENAI_API_KEY, logger: options.logger }));
    if (text && options.misskey) {
      const note = await options.client.createNote({ text, visibility: "public" });
      await options.db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'normal', @text, 'public', 'ohayou', @createdAt)`,
        { noteId: note.id, postedAt: options.at, text, createdAt: options.at }
      );
      await options.db.run("UPDATE bot_state SET last_note_at = @at WHERE id = 1", { at: options.at });
      options.logger.info("scheduledPost.ohayou", { at: options.at, noteId: note.id });
    }
    return;
  }

  // 寝言ガチャ
  const murmurProb = readNumberSetting(settings, "MURMUR_PROBABILITY_PER_TICK", 0.001);
  if (rand() < murmurProb) {
    const text = await generateMurmurPost({ settings, at: options.at, chutesApiKey: process.env.CHUTES_API_KEY, openaiApiKey: process.env.OPENAI_API_KEY, logger: options.logger });
    if (text && options.misskey) {
      const note = await options.client.createNote({ text, visibility: "public" });
      await options.db.run(
        `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
         VALUES (@noteId, @postedAt, 'normal', @text, 'public', 'murmur', @createdAt)`,
        { noteId: note.id, postedAt: options.at, text, createdAt: options.at }
      );
      options.logger.info("scheduledPost.murmur", { at: options.at, noteId: note.id });
    }
    return;
  }

  options.logger.info("scheduledPost.skip", { at: options.at, reason: "sleeping" });
  return;
}

// 就寝チェック
const sleepAt = botState?.sleep_at ? new Date(botState.sleep_at) : null;
if (sleepAt && now >= sleepAt) {
  const newWakeAt = computeNextWakeAt(settings, now, rand);
  await options.db.run(
    "UPDATE bot_state SET sleeping = 1, sleep_at = NULL, wake_at = @wakeAt, updated_at = @at WHERE id = 1",
    { wakeAt: newWakeAt, at: options.at }
  );
  const text = await generateOyasumiPost({ settings, at: options.at, chutesApiKey: process.env.CHUTES_API_KEY, openaiApiKey: process.env.OPENAI_API_KEY, logger: options.logger });
  if (text && options.misskey) {
    const note = await options.client.createNote({ text, visibility: "public" });
    await options.db.run(
      `INSERT INTO posts (note_id, posted_at, kind, text, visibility, generated_reason, created_at)
       VALUES (@noteId, @postedAt, 'normal', @text, 'public', 'oyasumi', @createdAt)`,
      { noteId: note.id, postedAt: options.at, text, createdAt: options.at }
    );
    await options.db.run("UPDATE bot_state SET last_note_at = @at WHERE id = 1", { at: options.at });
    options.logger.info("scheduledPost.oyasumi", { at: options.at, noteId: note.id });
  }
  return;
}

// ===== 通常の投稿抽選（既存フロー）=====
```

**注意点:**
- `options.misskey` が undefined（テスト時）の場合は投稿しないが、sleep/wake の state 更新は行う
- `options.generateText` は既存のテスト用モック。sleep 投稿のテストには別途 `options.generateOyasumiText` 等を追加してもよいが、初期実装では省略可
- `options.client` のチェックは既存コードに倣う

### 変更ファイル 2: `src/db/schema.ts`

`seedRuntimeSettings` に以下を追加（日本語 description）:

```typescript
// 睡眠スケジュール（JST HH:MM）
["SLEEP_TIME_MON", "01:30", "string", "sleep_schedule", "月曜夜の就寝目標時刻（JST HH:MM）。"],
["SLEEP_TIME_TUE", "01:30", "string", "sleep_schedule", "火曜夜の就寝目標時刻（JST HH:MM）。"],
["SLEEP_TIME_WED", "01:30", "string", "sleep_schedule", "水曜夜の就寝目標時刻（JST HH:MM）。"],
["SLEEP_TIME_THU", "01:30", "string", "sleep_schedule", "木曜夜の就寝目標時刻（JST HH:MM）。"],
["SLEEP_TIME_FRI", "02:30", "string", "sleep_schedule", "金曜夜の就寝目標時刻（JST HH:MM）。"],
["SLEEP_TIME_SAT", "03:30", "string", "sleep_schedule", "土曜夜の就寝目標時刻（JST HH:MM）。"],
["SLEEP_TIME_SUN", "02:30", "string", "sleep_schedule", "日曜夜の就寝目標時刻（JST HH:MM）。"],
["WAKE_TIME_MON", "07:30", "string", "sleep_schedule", "月曜朝の起床目標時刻（JST HH:MM）。"],
["WAKE_TIME_TUE", "07:30", "string", "sleep_schedule", "火曜朝の起床目標時刻（JST HH:MM）。"],
["WAKE_TIME_WED", "07:30", "string", "sleep_schedule", "水曜朝の起床目標時刻（JST HH:MM）。"],
["WAKE_TIME_THU", "07:30", "string", "sleep_schedule", "木曜朝の起床目標時刻（JST HH:MM）。"],
["WAKE_TIME_FRI", "08:30", "string", "sleep_schedule", "金曜朝の起床目標時刻（JST HH:MM）。"],
["WAKE_TIME_SAT", "11:00", "string", "sleep_schedule", "土曜朝の起床目標時刻（JST HH:MM）。"],
["WAKE_TIME_SUN", "10:00", "string", "sleep_schedule", "日曜朝の起床目標時刻（JST HH:MM）。"],
["SLEEP_SCHEDULE_JITTER_MINUTES", "30", "integer", "sleep_schedule", "就寝・起床時刻のランダムずれ幅（分）。±この値の範囲内で実際の時刻が決まる。"],
["MURMUR_PROBABILITY_PER_TICK", "0.001", "number", "sleep_schedule", "5分tickあたりの寝言発生確率（月約2回 = 0.001）。"],
```

---

## タスク③: 体験候補AI判定

### 参照ドキュメント

`docs/spec/experience-candidate-classifier.md` を必読のこと。

### 新規ファイル: `src/ai/classify-experience-candidate.ts`

`classify-quote-safety.ts` をベースに以下の変更:
- SYSTEM_PROMPT を experience-candidate-classifier.md 記載の内容に変更
- 関数名: `classifyExperienceCandidate`
- 引数・返値: `classifyQuoteSafety` と同じ型
- maxTokens: 5, temperature: 0.0, 失敗時 NG扱い（既存と同じ）

### 変更ファイル: `src/experience-scan.ts`

1. import を `classifyQuoteSafety` → `classifyExperienceCandidate` に変更
2. INSERT 文に `expires_at` カラムを追加:

```typescript
const expiresAt = new Date(new Date(options.at).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

await options.db.run(
  `INSERT INTO experience_candidates (
     source_note_id, source_user_id, picked_at, candidate_type,
     summary, safety_class, status, expires_at, created_at
   )
   VALUES (
     @sourceNoteId, @sourceUserId, @pickedAt, 'tl_observation',
     @summary, 'ok', 'pending', @expiresAt, @createdAt
   )`,
  {
    sourceNoteId: `tl_${options.at}_${saved}`,
    sourceUserId: null,
    pickedAt: options.at,
    summary,
    expiresAt,   // 追加
    createdAt: options.at,
  }
);
```

---

## 実装後の確認事項

### タスク① NoteHint
- `npm test` で全テスト通過
- `npm run build` 成功

### タスク② 睡眠
- `npm run build` 成功
- `docker compose up -d --build` 後にログで `scheduledPost.oyasumi` が就寝時刻に出ること
- DB 確認: `SELECT sleeping, sleep_at, wake_at FROM bot_state WHERE id=1;`
- beta-test1 モードでも sleeping チェックが機能すること

### タスク③ 体験候補
- `npm run build` 成功
- `experience_candidates` に `expires_at` が入ること:
  ```sql
  SELECT summary, safety_class, expires_at FROM experience_candidates ORDER BY created_at DESC LIMIT 5;
  ```

---

## 実装順序の推奨

1. タスク③（最も小さい）
2. タスク①（小さい）
3. タスク②（最も大きい・複雑）

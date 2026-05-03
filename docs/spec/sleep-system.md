# 睡眠システム仕様

## 概要

かなめに生活リズムを持たせる。週単位の就寝・起床スケジュールに従い、睡眠中は通常投稿を停止し、代わりに起床ガチャ・寝言ガチャを実行する。

## DB設定値（m_runtime_setting）

### 週スケジュール（HH:MM 形式、JST）

| setting_key | 初期値 | 意味 |
|---|---|---|
| `SLEEP_TIME_MON` | `01:30` | 月曜夜の就寝目標時刻（JST）|
| `SLEEP_TIME_TUE` | `01:30` | 火曜夜 |
| `SLEEP_TIME_WED` | `01:30` | 水曜夜 |
| `SLEEP_TIME_THU` | `01:30` | 木曜夜 |
| `SLEEP_TIME_FRI` | `02:30` | 金曜夜 |
| `SLEEP_TIME_SAT` | `03:30` | 土曜夜 |
| `SLEEP_TIME_SUN` | `02:30` | 日曜夜 |
| `WAKE_TIME_MON` | `07:30` | 月曜朝の起床目標時刻（JST）|
| `WAKE_TIME_TUE` | `07:30` | 火曜朝 |
| `WAKE_TIME_WED` | `07:30` | 水曜朝 |
| `WAKE_TIME_THU` | `07:30` | 木曜朝 |
| `WAKE_TIME_FRI` | `08:30` | 金曜朝 |
| `WAKE_TIME_SAT` | `11:00` | 土曜朝 |
| `WAKE_TIME_SUN` | `10:00` | 日曜朝 |
| `SLEEP_SCHEDULE_JITTER_MINUTES` | `30` | 就寝・起床時刻のランダムずれ幅（分）|
| `MURMUR_PROBABILITY_PER_TICK` | `0.001` | 5分tickあたりの寝言発生確率（月約2回）|

### 確率の根拠

- 設定時刻 ± `JITTER_MINUTES` 分の範囲内（計60分）に収まる確率 ≈ 100%
- 実装: `offset = Math.floor((rand() * 2 - 1) * JITTER_MINUTES)` 分のランダムずれ
- 寝言: 1日の睡眠時間 ≈ 7時間 = 84 tick。月30日で約2520 tick。月2回 → 0.001/tick ≈ 0.08%

## bot_state フィールド（既存）

```sql
sleeping INTEGER NOT NULL DEFAULT 0   -- 0=起きている 1=寝ている
sleep_at TEXT                          -- 次回就寝のISO timestamp（UTC）
wake_at  TEXT                          -- 次回起床のISO timestamp（UTC）
```

## 就寝・起床時刻の計算ルール

### SLEEP_TIME の解釈

`SLEEP_TIME_<DOW>` は「その曜日の夜に眠る時刻」。

- 01:30 のように 06:00 未満の場合 → 翌日のカレンダー日付 01:30 JST として扱う
- 22:00 のように 06:00 以上の場合 → 当日のカレンダー日付 22:00 JST として扱う

例）JST 月曜日に `SLEEP_TIME_MON=01:30` → 火曜日 01:30 JST がターゲット

### WAKE_TIME の解釈

`WAKE_TIME_<DOW>` は「その曜日の朝に起きる時刻」。

- 当日のカレンダー日付 HH:MM JST として扱う（常に午前）

### 計算関数のインターフェース（実装ヒント）

```typescript
// 次の就寝時刻を計算
function computeNextSleepAt(settings: RuntimeSettings, now: Date, rand: () => number): string
// 引数: 現在時刻（UTC）
// 返値: ISO timestamp（UTC）

// 次の起床時刻を計算  
function computeNextWakeAt(settings: RuntimeSettings, now: Date, rand: () => number): string
// 引数: 就寝時の現在時刻（UTC）。翌朝の WAKE_TIME を使う。
// 返値: ISO timestamp（UTC）
```

### 計算の手順

```
computeNextSleepAt(now):
  1. JST に変換: jstNow = now + 9h
  2. 曜日取得: dow = jstNow.getDay()  // 0=Sun, 1=Mon, ...
  3. 設定値取得: timeStr = settings["SLEEP_TIME_<DOW>"]
  4. jitter = Math.floor((rand() * 2 - 1) * JITTER_MINUTES)
  5. hours = parseInt(timeStr.split(":")[0])
  6. minutes = parseInt(timeStr.split(":")[1]) + jitter
  7. baseDate = jstNow の日付部分（YYYY-MM-DD）
  8. if hours < 6: baseDate += 1日
  9. sleepAt_jst = baseDate + "T" + HH:MM + ":00+09:00"（時分を正規化）
  10. return UTC ISO string

computeNextWakeAt(now):
  1. JST に変換: jstNow = now + 9h
  2. 翌日の曜日: dowTomorrow = (jstNow.getDay() + 1) % 7
  3. 設定値取得: timeStr = settings["WAKE_TIME_<DOW_TOMORROW>"]
  4. jitter = Math.floor((rand() * 2 - 1) * JITTER_MINUTES)
  5. tomorrowDate = jstNow の翌日（YYYY-MM-DD）
  6. wakeAt_jst = tomorrowDate + "T" + HH:MM + ":00+09:00"（time + jitter）
  7. return UTC ISO string
```

## runScheduledPostDraw の拡張フロー

```
runScheduledPostDraw(options):

  [0] 既存: SCHEDULED_POSTING_ENABLED チェック

  [1] bot_state から sleeping / sleep_at / wake_at を取得

  [2] 睡眠状態に応じて分岐

  sleeping = 1（寝ている）:
    a. wake_at が null → emergency: computeNextWakeAt して DB 更新、skip
    b. now >= wake_at:
       - bot_state: sleeping=0, wake_at=NULL, sleep_at=computeNextSleepAt()
       - generateOhayouPost() → createNote → posts に記録
       - return
    c. murmur gacha: rand() < MURMUR_PROBABILITY_PER_TICK:
       - generateMurmurPost() → createNote → posts に記録
       - return
    d. 何もない → skip(reason: "sleeping")
    return

  sleeping = 0（起きている）:
    a. sleep_at が null → computeNextSleepAt して DB 更新
    b. now >= sleep_at:
       - bot_state: sleeping=1, sleep_at=NULL, wake_at=computeNextWakeAt()
       - generateOyasumiPost() → createNote → posts に記録
       - return
    c. 通常の投稿抽選（既存フロー）へ続く
```

## posts テーブルへの記録

おやすみ・おはよう・寝言はすべて通常投稿として記録する。

| 投稿種別 | kind | generated_reason | visibility |
|---|---|---|---|
| おやすみ | `normal` | `oyasumi` | `public` |
| おはよう | `normal` | `ohayou` | `public` |
| 寝言 | `normal` | `murmur` | `public` |

おやすみ・おはようは `last_note_at` を更新する（通常投稿と同じ扱い）。

## AI 生成プロンプト仕様（generate-sleep-post.ts）

### 共通

- `buildCharacterSystemPrompt` を使う（既存の character-spec.ts）
- maxTokens: 300
- temperature: 0.9（通常より高め、表現に幅を持たせる）

### おやすみ（generateOyasumiPost）

**userMessage:**
```
現在時刻: {at}（JST目安 {hour}時台）

かなめとして、就寝するノートを1つ書いてください。

制約:
- 必ず「おやすみ」という言葉をテキスト内に含めること
- 1〜3行（50字以内を目安）
- 寝ることが伝わる内容であれば他は自由
- 文体・話題・締め方は自由（毎回変えること）
- 例: 「今日も観測がはかどった。おやすみ。」のような感じでよい
```

### おはよう（generateOhayouPost）

**userMessage:**
```
現在時刻: {at}（JST目安 {hour}時台）

かなめとして、起床したノートを1つ書いてください。

制約:
- 必ず「おはよう」という言葉をテキスト内に含めること
- 1〜3行（50字以内を目安）
- 起きたことが伝わる内容であれば他は自由
- 体調・気分・今日の予定・前日の余韻など何でもよい
```

### 寝言（generateMurmurPost）

**userMessage:**
```
現在時刻: {at}（JST目安 {hour}時台）

かなめが睡眠中につぶやく「寝言」ノートを1つ書いてください。

制約:
- 「おやすみ」「おはよう」は使わない
- 夢の断片、意味のないつぶやき、文脈が繋がらない内容
- 1〜2行、短め（40字以内を目安）
- 後から読んで「なんで言ったんだろう」と思えるもの
```

## 新規ファイル・変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src/sleep-schedule.ts` | 新規 | computeNextSleepAt / computeNextWakeAt |
| `src/ai/generate-sleep-post.ts` | 新規 | generateOyasumiPost / generateOhayouPost / generateMurmurPost |
| `src/scheduled-post.ts` | 変更 | sleep フロー追加（[1][2] の挿入） |
| `src/db/schema.ts` | 変更 | 16 設定値を seed に追加 |

import type { RuntimeSettings } from "./runtime-settings.js";
import { readStringSetting, readIntegerSetting } from "./runtime-settings.js";

const DOW_KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

// HH:MM 文字列と jitter を受け取り、基準日（JST YYYY-MM-DD）から offset 適用済み ISO 文字列を返す
function buildTimestamp(baseDateJst: string, hhMm: string, jitterMinutes: number, rand: () => number): string {
  const [hStr, mStr] = hhMm.split(":");
  const originalHours = parseInt(hStr ?? "0", 10);
  let hours = originalHours;
  let minutes = parseInt(mStr ?? "0", 10) + Math.floor((rand() * 2 - 1) * jitterMinutes);

  // 正規化
  while (minutes < 0) { minutes += 60; hours -= 1; }
  while (minutes >= 60) { minutes -= 60; hours += 1; }
  hours = ((hours % 24) + 24) % 24;

  const [y, mo, d] = baseDateJst.split("-").map(Number);
  const baseDate = new Date(y!, mo! - 1, d!);
  // SLEEP_TIME の解釈: 06:00 未満は翌日
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
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const jitter = readIntegerSetting(settings, "SLEEP_SCHEDULE_JITTER_MINUTES", 30);

  // 今日の起床時刻（jitterなし）が現在より未来なら今日を使う。
  // 再起動などで wake_at が失われた場合に翌々日になるのを防ぐ。
  const todayDow = jstDayOfWeek(now);
  const todayKey = DOW_KEYS[todayDow]!;
  const todayTimeStr = readStringSetting(settings, `WAKE_TIME_${todayKey}`, "07:30");
  const todayJst = jstNow.toISOString().slice(0, 10);
  const [todayH, todayM] = todayTimeStr.split(":").map(Number);
  const todayWakeUtc = new Date(`${todayJst}T${String(todayH ?? 7).padStart(2, "0")}:${String(todayM ?? 30).padStart(2, "0")}:00+09:00`);

  if (todayWakeUtc > now) {
    return buildTimestamp(todayJst, todayTimeStr, jitter, rand);
  }

  // 今日の起床時刻が過ぎていたら翌日を使う（通常の就寝フロー）
  const dowTomorrow = (todayDow + 1) % 7;
  const tomorrowKey = DOW_KEYS[dowTomorrow]!;
  const tomorrowTimeStr = readStringSetting(settings, `WAKE_TIME_${tomorrowKey}`, "07:30");
  const jstTomorrow = new Date(jstNow.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowJst = jstTomorrow.toISOString().slice(0, 10);
  return buildTimestamp(tomorrowJst, tomorrowTimeStr, jitter, rand);
}

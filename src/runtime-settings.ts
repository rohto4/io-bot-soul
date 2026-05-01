import type { DbClient } from "./db/client.js";

export type RuntimeSettingRow = {
  setting_key: string;
  setting_value: string;
  value_type: string;
  category: string;
};

export type RuntimeSettings = Map<string, string>;

export async function loadRuntimeSettings(db: DbClient): Promise<RuntimeSettings> {
  const rows = await db.all<RuntimeSettingRow>(
    `
    SELECT setting_key, setting_value, value_type, category
    FROM m_runtime_setting
    `
  );

  return new Map(rows.map((row) => [row.setting_key, row.setting_value]));
}

export function readNumberSetting(settings: RuntimeSettings, key: string, fallback: number): number {
  const value = settings.get(key);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readIntegerSetting(settings: RuntimeSettings, key: string, fallback: number): number {
  return Math.trunc(readNumberSetting(settings, key, fallback));
}

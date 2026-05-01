import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("loads valid bot config with numeric intervals", () => {
    const config = loadConfig({
      MISSKEY_HOST: "https://misskey.io",
      MISSKEY_TOKEN: "token",
      PINNED_CONSENT_NOTE_ID: "note-id",
      ADMIN_ACCOUNT: "@unibell4",
      DATABASE_PROVIDER: "postgres",
      DATABASE_URL: "postgresql://example",
      SQLITE_PATH: "/app/data/bot.sqlite",
      POLL_INTERVAL_SECONDS: "60",
      POST_DRAW_INTERVAL_SECONDS: "300",
      SCHEDULED_POSTING_ENABLED: "true",
      LOG_LEVEL: "debug"
    });

    expect(config.pollIntervalMs).toBe(60_000);
    expect(config.postDrawIntervalMs).toBe(300_000);
    expect(config.scheduledPostingEnabled).toBe(true);
    expect(config.databaseProvider).toBe("postgres");
    expect(config.databaseUrl).toBe("postgresql://example");
    expect(config.misskeyHost).toBe("https://misskey.io");
  });

  it("uses safe defaults for optional values", () => {
    const config = loadConfig({
      MISSKEY_TOKEN: "token"
    });

    expect(config.misskeyHost).toBe("https://misskey.io");
    expect(config.adminAccount).toBe("@unibell4");
    expect(config.databaseProvider).toBe("sqlite");
    expect(config.databaseUrl).toBe("");
    expect(config.sqlitePath).toBe("./data/bot.sqlite");
    expect(config.pollIntervalMs).toBe(60_000);
    expect(config.postDrawIntervalMs).toBe(300_000);
    expect(config.scheduledPostingEnabled).toBe(false);
  });

  it("rejects invalid interval values", () => {
    expect(() =>
      loadConfig({
        MISSKEY_TOKEN: "token",
        POLL_INTERVAL_SECONDS: "0"
      })
    ).toThrow(/POLL_INTERVAL_SECONDS/);
  });
});

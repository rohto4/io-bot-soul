import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/db/database.js";

describe("openDatabase", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates parent directories and migrates file database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "io-bot-soul-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "nested", "bot.sqlite");

    const db = await openDatabase({
      provider: "sqlite",
      sqlitePath: dbPath
    });

    expect(await db.get("SELECT COUNT(*) AS count FROM bot_state")).toEqual({ count: 1 });
    await db.close();
  });
});

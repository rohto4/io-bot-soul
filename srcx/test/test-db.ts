import { openDatabase } from "../../src/db/database.js";
import type { DbClient } from "../../src/db/client.js";

export async function createTestDb(): Promise<DbClient> {
  return openDatabase({
    provider: "sqlite",
    sqlitePath: ":memory:"
  });
}

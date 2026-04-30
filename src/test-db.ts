import { openDatabase } from "./db/database.js";
import type { DbClient } from "./db/client.js";

export async function createTestDb(): Promise<DbClient> {
  return openDatabase({
    provider: "sqlite",
    sqlitePath: ":memory:"
  });
}

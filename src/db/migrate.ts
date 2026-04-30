import { loadConfig } from "../config.js";
import { openDatabase } from "./database.js";

const config = loadConfig();
const db = await openDatabase({
  provider: config.databaseProvider,
  sqlitePath: config.sqlitePath,
  databaseUrl: config.databaseUrl
});
await db.close();
console.log(`Migrated ${config.databaseProvider} database`);

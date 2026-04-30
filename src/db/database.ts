import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";
import type { DatabaseProvider, DbClient, DbParams } from "./client.js";
import { migrate } from "./schema.js";

type OpenDatabaseOptions = {
  provider: DatabaseProvider;
  sqlitePath: string;
  databaseUrl?: string;
};

class SqliteClient implements DbClient {
  constructor(private readonly db: Database.Database) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: DbParams = {}): Promise<void> {
    this.db.prepare(sql).run(params);
  }

  async get<T>(sql: string, params: DbParams = {}): Promise<T | undefined> {
    return this.db.prepare(sql).get(params) as T | undefined;
  }

  async all<T>(sql: string, params: DbParams = {}): Promise<T[]> {
    return this.db.prepare(sql).all(params) as T[];
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

class PostgresClient implements DbClient {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
    });
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async run(sql: string, params: DbParams = {}): Promise<void> {
    const query = toPostgresQuery(sql, params);
    await this.pool.query(query.text, query.values);
  }

  async get<T>(sql: string, params: DbParams = {}): Promise<T | undefined> {
    const query = toPostgresQuery(sql, params);
    const result = await this.pool.query(query.text, query.values);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, params: DbParams = {}): Promise<T[]> {
    const query = toPostgresQuery(sql, params);
    const result = await this.pool.query(query.text, query.values);
    return result.rows as T[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function toPostgresQuery(sql: string, params: DbParams): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const indexes = new Map<string, number>();
  const text = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, key: string) => {
    if (!indexes.has(key)) {
      indexes.set(key, values.length + 1);
      values.push(params[key]);
    }
    return `$${indexes.get(key)}`;
  });

  return { text, values };
}

export async function openDatabase(options: OpenDatabaseOptions): Promise<DbClient> {
  if (options.provider === "postgres") {
    if (!options.databaseUrl) {
      throw new Error("DATABASE_URL is required when DATABASE_PROVIDER=postgres");
    }
    const db = new PostgresClient(options.databaseUrl);
    await migrate(db, "postgres");
    return db;
  }

  if (options.sqlitePath !== ":memory:") {
    mkdirSync(dirname(options.sqlitePath), { recursive: true });
  }

  const sqlite = new Database(options.sqlitePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = new SqliteClient(sqlite);
  await migrate(db, "sqlite");
  return db;
}

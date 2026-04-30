export type DbParams = Record<string, unknown>;

export type DbClient = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: DbParams): Promise<void>;
  get<T = unknown>(sql: string, params?: DbParams): Promise<T | undefined>;
  all<T = unknown>(sql: string, params?: DbParams): Promise<T[]>;
  close(): Promise<void>;
};

export type DatabaseProvider = "sqlite" | "postgres";

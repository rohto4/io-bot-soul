import type { DbClient } from "./db/client.js";

function getCutoffISO(at: string, minutes: number): string {
  return new Date(new Date(at).getTime() - minutes * 60 * 1000).toISOString();
}

export async function checkNotesPerHour(db: DbClient, at: string, limit: number): Promise<boolean> {
  const cutoff = getCutoffISO(at, 60);
  const row = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM posts WHERE posted_at > @cutoff`,
    { cutoff }
  );
  return (row?.cnt ?? 0) >= limit;
}

export async function checkNotesPerDay(db: DbClient, at: string, limit: number): Promise<boolean> {
  const cutoff = getCutoffISO(at, 24 * 60);
  const row = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM posts WHERE posted_at > @cutoff`,
    { cutoff }
  );
  return (row?.cnt ?? 0) >= limit;
}

export async function checkQuoteRenotesPerDay(db: DbClient, at: string, limit: number): Promise<boolean> {
  const cutoff = getCutoffISO(at, 24 * 60);
  const row = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM posts WHERE kind = 'quote_renote' AND posted_at > @cutoff`,
    { cutoff }
  );
  return (row?.cnt ?? 0) >= limit;
}

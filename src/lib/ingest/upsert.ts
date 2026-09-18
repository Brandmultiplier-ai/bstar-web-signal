import type { Database } from "@/lib/database.types";
import type { AdminClient as Admin } from "@/lib/supabase/types";

type TableName = keyof Database["public"]["Tables"];

/** Postgres tops out well below this, but large windows can produce thousands
 * of rows and a single oversized statement is slower than a few batched ones. */
const BATCH_SIZE = 500;

/**
 * Batched, keyed upsert. Every fact table is keyed on its natural grain, so
 * re-running a window overwrites that window's rows instead of adding to
 * them. Historical days that are not in the current window are never
 * deleted — that is how All time grows.
 */
export async function upsertRows<T extends TableName>(
  admin: Admin,
  table: T,
  rows: Database["public"]["Tables"][T]["Insert"][],
  onConflict: string,
): Promise<number> {
  if (rows.length === 0) return 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    // supabase-js cannot narrow its row type through a generic table name.
    // Callers are still checked: `rows` is typed as that table's Insert.
    const client = admin.from(table) as unknown as {
      upsert: (rows: unknown[], options: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await client.upsert(batch, { onConflict });
    if (error) {
      throw new Error(`Upsert into ${table} failed: ${error.message}`);
    }
  }

  return rows.length;
}

/**
 * Sums duplicate rows into one entry per key. Upstream breakdowns often return
 * several rows that collapse to the same primary key once we normalise a
 * dimension (a trailing-slash path, a null placement), and the last-write-wins
 * behaviour of upsert would otherwise discard all but one of them.
 */
export function foldByKey<T>(
  rows: T[],
  keyOf: (row: T) => string,
  merge: (existing: T, incoming: T) => T,
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = byKey.get(key);
    byKey.set(key, existing ? merge(existing, row) : row);
  }
  return [...byKey.values()];
}

/**
 * Re-pull Search Console queries for one active site and upsert them.
 * Click-earning queries are kept alongside impression leaders. Nothing is deleted.
 *
 *   npx tsx scripts/refresh-gsc-queries.ts brandmultiplier
 */
import "./load-env-local";

import { createAdminClient } from "@/lib/supabase/admin";
import { ingestWindow } from "@/lib/dates";
import { gscIngestor } from "@/lib/ingest/sources/gsc";
import { SOURCE_INITIAL_LOOKBACK_DAYS } from "@/lib/sources";
import type { Site } from "@/lib/database.types";

async function main() {
  const slug = process.argv[2] ?? "brandmultiplier";
  const admin = createAdminClient();
  const { data, error } = await admin.from("sites").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No site with slug "${slug}"`);

  const window = ingestWindow(SOURCE_INITIAL_LOOKBACK_DAYS.gsc);
  const result = await gscIngestor.run({
    admin,
    sites: [data as Site],
    window,
  });
  console.log(JSON.stringify({ slug, window, result }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

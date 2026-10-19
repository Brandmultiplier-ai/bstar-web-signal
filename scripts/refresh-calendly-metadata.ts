/**
 * Re-read Calendly far enough back to fill event slugs and reschedule links
 * on rows already stored. Upsert only. Nothing is deleted.
 *
 *   npx tsx scripts/refresh-calendly-metadata.ts
 */
import "./load-env-local";

import { createAdminClient } from "@/lib/supabase/admin";
import { calendlyIngestor } from "@/lib/ingest/sources/calendly";
import { todayUtc, toDateString } from "@/lib/dates";

async function main() {
  const admin = createAdminClient();
  const result = await calendlyIngestor.run({
    admin,
    sites: [],
    window: { start: "2025-01-01", end: toDateString(todayUtc()) },
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

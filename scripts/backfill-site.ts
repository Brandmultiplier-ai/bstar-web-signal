/**
 * First-fill for one active site: 480-day GA4 + Search Console upsert.
 * Cron lookback stays short once this site has enough stored days.
 *
 *   npx tsx scripts/backfill-site.ts chrisrubincreativ
 */
import "./load-env-local";

import { createAdminClient } from "@/lib/supabase/admin";
import { ingestWindow } from "@/lib/dates";
import { SOURCE_INITIAL_LOOKBACK_DAYS } from "@/lib/sources";
import { ga4Ingestor } from "@/lib/ingest/sources/ga4";
import { gscIngestor } from "@/lib/ingest/sources/gsc";
import type { Site } from "@/lib/database.types";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/backfill-site.ts <site-slug>");
    process.exit(1);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("sites").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No site with slug "${slug}"`);
  if (!data.is_active) throw new Error(`Site "${slug}" is not active`);

  const sites = [data as Site];
  const window = ingestWindow(SOURCE_INITIAL_LOOKBACK_DAYS.ga4);
  console.error(JSON.stringify({ slug, siteId: data.id, window }, null, 2));

  const ga4 = await ga4Ingestor.run({ admin, sites, window });
  console.error(JSON.stringify({ ga4 }, null, 2));

  const gsc = await gscIngestor.run({ admin, sites, window });
  console.error(JSON.stringify({ gsc }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});

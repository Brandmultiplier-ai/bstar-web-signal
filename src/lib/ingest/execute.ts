import { createAdminClient } from "@/lib/supabase/admin";
import { ingestWindow } from "@/lib/dates";
import { SOURCE_INITIAL_LOOKBACK_DAYS, SOURCE_LOOKBACK_DAYS, type ScheduledSource } from "@/lib/sources";
import { completeRun, failRun, openRun } from "@/lib/ingest/run";
import type { Ingestor, IngestResult } from "@/lib/ingest/types";
import type { Site } from "@/lib/database.types";

export type ExecuteOutcome =
  | ({ ok: true; source: ScheduledSource; window: { start: string; end: string } } & IngestResult)
  | { ok: false; source: ScheduledSource; error: string };

/**
 * Runs one ingestor end to end: computes its window, records the attempt,
 * loads the active site registry, and closes the run either way. Errors are
 * swallowed into the return value rather than thrown, because a cron caller
 * has nowhere to see a 500 — the `ingestion_runs` row is the report.
 *
 * Ingest never truncates fact tables. A run only upserts the current window.
 * Older days stay, which is what 10d / 20d / All time read.
 */
export async function executeIngest(ingestor: Ingestor): Promise<ExecuteOutcome> {
  const admin = createAdminClient();
  const window = ingestWindow(await resolveLookback(admin, ingestor.source));
  const run = await openRun(admin, ingestor.source, window);

  try {
    const { data, error } = await admin
      .from("sites")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw new Error(`Could not load site registry: ${error.message}`);

    const result = await ingestor.run({ admin, sites: (data ?? []) as Site[], window });
    await completeRun(admin, run, result.rowsWritten);

    return { ok: true, source: ingestor.source, window, ...result };
  } catch (error) {
    await failRun(admin, run, error);
    return {
      ok: false,
      source: ingestor.source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveLookback(
  admin: ReturnType<typeof createAdminClient>,
  source: ScheduledSource,
): Promise<number> {
  const configured = SOURCE_LOOKBACK_DAYS[source];
  const initial = SOURCE_INITIAL_LOOKBACK_DAYS[source];
  if (initial <= configured) return configured;

  const table =
    source === "ga4"
      ? "ga4_daily"
      : source === "gsc"
        ? "gsc_daily"
        : source === "calendly"
          ? "calendly_bookings"
          : null;
  if (!table) return configured;

  const filled = source === "calendly" ? 1 : 32;

  // Calendly is account-wide. GA4 and Search Console are per site, so a new
  // property must still get the long first window even when another site is full.
  if (source === "calendly") {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error || (count ?? 0) < filled) return initial;
    return configured;
  }

  const { data: sites, error: sitesError } = await admin
    .from("sites")
    .select("id")
    .eq("is_active", true);
  if (sitesError || !sites?.length) return initial;

  const perSiteTable = table === "ga4_daily" ? table : "gsc_daily";
  for (const site of sites) {
    const { count, error } = await admin
      .from(perSiteTable)
      .select("*", { count: "exact", head: true })
      .eq("site_id", site.id);
    if (error || (count ?? 0) < filled) return initial;
  }
  return configured;
}

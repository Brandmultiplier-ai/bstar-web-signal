import type { IngestSource } from "@/lib/database.types";
import type { AdminClient as Admin } from "@/lib/supabase/types";

export type RunHandle = { id: number };

export type RunWindow = { start: string; end: string } | null;

/**
 * Opens an `ingestion_runs` row in the `running` state. Recorded before the
 * first upstream call so a route that crashes hard still leaves evidence.
 */
export async function openRun(
  admin: Admin,
  source: IngestSource,
  window: RunWindow,
  siteId: string | null = null,
): Promise<RunHandle> {
  const { data, error } = await admin
    .from("ingestion_runs")
    .insert({
      source,
      site_id: siteId,
      status: "running",
      window_start: window?.start ?? null,
      window_end: window?.end ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not open ingestion run: ${error.message}`);
  return { id: data.id };
}

export async function completeRun(
  admin: Admin,
  run: RunHandle,
  rowsWritten: number,
): Promise<void> {
  await admin
    .from("ingestion_runs")
    .update({
      status: "success",
      finished_at: new Date().toISOString(),
      rows_written: rowsWritten,
    })
    .eq("id", run.id);
}

/**
 * Closes a run as failed. The dashboard reads the last *successful* finish, so
 * recording the failure is what turns a broken cron into a visible stale badge
 * rather than a silent gap in the charts.
 */
export async function failRun(admin: Admin, run: RunHandle, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await admin
    .from("ingestion_runs")
    .update({
      status: "error",
      finished_at: new Date().toISOString(),
      // Upstream errors can carry very long payloads; keep the row readable.
      error: message.slice(0, 2000),
    })
    .eq("id", run.id);
}

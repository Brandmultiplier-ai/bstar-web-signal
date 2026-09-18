import { NextResponse } from "next/server";

import { isAuthorizedIngestRequest } from "@/lib/ingest/auth";
import { executeIngest } from "@/lib/ingest/execute";
import { INGESTORS } from "@/lib/ingest/registry";
import { isScheduledSource } from "@/lib/sources";

/** Third-party calls plus many upserts; well past the default serverless budget. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The endpoint pg_cron targets via pg_net, one source per path segment:
 *   POST /api/ingest/ga4  with header  x-ingest-secret: <INGEST_SECRET>
 *
 * Also safe to invoke by hand to force a refresh, since every write is a keyed
 * upsert over a fixed window.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  if (!isAuthorizedIngestRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { source } = await params;

  if (!isScheduledSource(source)) {
    return NextResponse.json(
      {
        error: `Unknown ingest source "${source}"`,
      },
      { status: 404 },
    );
  }

  const outcome = await executeIngest(INGESTORS[source]);

  // A failed run is already recorded in ingestion_runs, which is what drives
  // the stale badge in the UI. The 500 is for whoever is reading cron logs.
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 500 });
}

import { NextResponse } from "next/server";

import { executeIngest } from "@/lib/ingest/execute";
import { INGESTORS } from "@/lib/ingest/registry";
import { SCHEDULED_SOURCES, isScheduledSource, type ScheduledSource } from "@/lib/sources";
import { requireReader } from "@/lib/read/request";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Manual sync, triggered from the dashboard.
 *
 * Distinct from /api/ingest/[source], which pg_cron calls with a shared
 * secret. That secret cannot be used from the browser without exposing it, so
 * this route authenticates the signed-in user instead and then runs the same
 * ingestors server-side.
 *
 * POST /api/sync                  -> every scheduled source
 * POST /api/sync?source=clarity   -> one source
 */
export async function POST(request: Request) {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const requested = new URL(request.url).searchParams.get("source");
  let sources: ScheduledSource[];

  if (requested === null) {
    sources = [...SCHEDULED_SOURCES];
  } else if (isScheduledSource(requested)) {
    sources = [requested];
  } else {
    return NextResponse.json({ error: `Unknown source "${requested}"` }, { status: 400 });
  }

  // Sequential rather than parallel: Clarity is rate limited per project and
  // the Google APIs share one service account's quota.
  const results = [];
  for (const source of sources) {
    results.push(await executeIngest(INGESTORS[source]));
  }

  const failed = results.filter((result) => !result.ok);

  return NextResponse.json(
    {
      // A partial failure is normal here: a source with no credentials yet
      // fails while the configured ones still succeed.
      ok: failed.length === 0,
      ran: results.length,
      failed: failed.length,
      results,
    },
    { status: 200 },
  );
}

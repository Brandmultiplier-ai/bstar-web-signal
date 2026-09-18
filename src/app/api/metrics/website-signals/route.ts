import { NextResponse } from "next/server";

import { parseRange, rangeLengthDays, readFreshness, requireReader, requireSiteId } from "@/lib/read/request";
import { buildWebsiteData } from "@/lib/read/website-signals";

export const dynamic = "force-dynamic";

/**
 * Everything the Website Signals view renders, in the kit's `WebsiteData`
 * shape, plus the freshness of each source that feeds it. Reads only from our
 * own tables.
 */
export async function GET(request: Request) {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const siteId = requireSiteId(url);
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const range = parseRange(url);
  const days = rangeLengthDays(range);
  const { supabase } = auth;

  // The Clarity project is a property of the site registry, not of the
  // metrics, so it has to be resolved before the behavioral KPIs can be read.
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("clarity_project_id, domain")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError) return NextResponse.json({ error: siteError.message }, { status: 500 });
  if (!site) return NextResponse.json({ error: "Unknown siteId" }, { status: 404 });

  try {
    const [data, ga4, clarity, gsc] = await Promise.all([
      buildWebsiteData(supabase, {
        siteId,
        range,
        days: Number.isFinite(days) ? days : 28,
        allTime: range.allTime === true,
        clarityProjectId: site.clarity_project_id,
        domain: site.domain,
      }),
      readFreshness(supabase, "ga4"),
      readFreshness(supabase, "clarity"),
      readFreshness(supabase, "gsc"),
    ]);

    return NextResponse.json({ range, data, freshness: { ga4, clarity, gsc } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build website signals" },
      { status: 500 },
    );
  }
}

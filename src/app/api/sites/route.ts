import { NextResponse } from "next/server";

import { requireReader } from "@/lib/read/request";

export const dynamic = "force-dynamic";

/**
 * The site registry that drives the switcher. Only active sites are returned,
 * which is how findyourstoryline.com stays out of the UI until its
 * Clarity/Search Console status is confirmed.
 *
 * The per-source config columns are exposed as booleans rather than raw IDs:
 * the dashboard only needs to know which tabs to show, and property IDs are
 * not something to hand to the browser.
 */
export async function GET() {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("sites")
    .select("id, slug, domain, display_name, ga4_property_id, gsc_site_url, clarity_project_id")
    .eq("is_active", true)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    sites: (data ?? []).map((site) => ({
      id: site.id,
      slug: site.slug,
      domain: site.domain,
      displayName: site.display_name,
      hasGa4: site.ga4_property_id !== null,
      hasSearchConsole: site.gsc_site_url !== null,
      hasClarity: site.clarity_project_id !== null,
    })),
  });
}

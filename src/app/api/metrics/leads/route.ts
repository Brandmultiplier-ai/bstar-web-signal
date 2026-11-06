import { NextResponse } from "next/server";

import { sumBy } from "@/lib/read/compare";
import {
  hostOf,
  pathOf,
  readCompanyVisits,
  readFormCaptures,
  type CompanyVisit,
  type FormCaptureRow,
} from "@/lib/read/leads";
import { parseRange, requireReader, requireSiteId } from "@/lib/read/request";
import { readJson, startTimer } from "@/lib/read/respond";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

const TOP_N = 25;
const UNKNOWN_COMPANY = "(company not identified)";
const UNATTRIBUTED = "(none)";

/**
 * Company-level RB2B visits and anonymous form captures for one site.
 * No visitor name, email, or LinkedIn URL is read or returned.
 */
export async function GET(request: Request) {
  const timer = startTimer();
  const auth = await requireReader();
  if (!auth.ok) return auth.response;
  timer.mark("auth");

  const url = new URL(request.url);
  const siteId = requireSiteId(url);
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const range = parseRange(url);
  const { supabase } = auth;

  const site = await supabase.from("sites").select("domain").eq("id", siteId).maybeSingle();
  if (site.error) return NextResponse.json({ error: site.error.message }, { status: 500 });
  if (!site.data) return NextResponse.json({ error: "Unknown siteId" }, { status: 404 });

  const [visits, forms] = await Promise.all([
    readCompanyVisits(supabase, siteId, range.start, range.end),
    readFormCaptures(supabase, site.data.domain, range.start, range.end),
  ]);
  timer.mark("db");

  return readJson(
    {
      range,
      companies: visits.available
        ? { available: true, ...summarizeCompanies(visits.rows) }
        : { available: false, reason: visits.reason },
      forms: forms.available
        ? { available: true, ...summarizeForms(forms.rows) }
        : { available: false, reason: forms.reason },
    },
    timer,
  );
}

function summarizeCompanies(rows: CompanyVisit[]) {
  const byCompany = new Map<
    string,
    { company: string; visits: number; pages: Set<string>; titles: Set<string>; lastSeen: string; firstSeen: string }
  >();
  for (const row of rows) {
    const company = row.company?.trim() || UNKNOWN_COMPANY;
    const entry = byCompany.get(company) ?? {
      company,
      visits: 0,
      pages: new Set<string>(),
      titles: new Set<string>(),
      lastSeen: row.captured_at,
      firstSeen: row.captured_at,
    };
    entry.visits += 1;
    entry.pages.add(pathOf(row.captured_url));
    if (row.title) entry.titles.add(row.title);
    if (row.captured_at > entry.lastSeen) entry.lastSeen = row.captured_at;
    if (row.captured_at < entry.firstSeen) entry.firstSeen = row.captured_at;
    byCompany.set(company, entry);
  }

  const identified = [...byCompany.values()].filter((row) => row.company !== UNKNOWN_COMPANY);
  return {
    totals: {
      visits: rows.length,
      companies: identified.length,
      unidentifiedVisits: byCompany.get(UNKNOWN_COMPANY)?.visits ?? 0,
    },
    series: [...sumBy(rows, (row) => row.captured_at.slice(0, 10), () => 1).entries()]
      .map(([date, value]) => ({ date, visits: value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    companies: [...byCompany.values()]
      .sort((a, b) => b.visits - a.visits || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, TOP_N)
      .map((row) => ({
        company: row.company,
        visits: row.visits,
        pages: [...row.pages].slice(0, 6),
        titles: [...row.titles].slice(0, 3),
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
      })),
    topPages: ranked(sumBy(rows, (row) => pathOf(row.captured_url), () => 1)),
    referrers: ranked(sumBy(rows, (row) => hostOf(row.referrer) ?? "(direct or unknown)", () => 1)),
  };
}

function summarizeForms(rows: FormCaptureRow[]) {
  const at = (row: FormCaptureRow) => row.submitted_at ?? row.received_at;
  return {
    totals: { submissions: rows.length },
    series: [...sumBy(rows, (row) => at(row).slice(0, 10), () => 1).entries()]
      .map(([date, value]) => ({ date, submissions: value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byForm: ranked(sumBy(rows, (row) => row.form_id, () => 1)),
    byPage: ranked(sumBy(rows, (row) => pathOf(row.page_url), () => 1)),
    bySource: ranked(
      sumBy(
        rows,
        (row) => `${row.utm_source || UNATTRIBUTED} / ${row.utm_medium || UNATTRIBUTED}`,
        () => 1,
      ),
    ),
    recent: rows.slice(0, TOP_N).map((row) => ({
      at: at(row),
      formId: row.form_id,
      intent: row.intent || null,
      page: pathOf(row.page_url),
      source: row.utm_source || null,
      medium: row.utm_medium || null,
      campaign: row.utm_campaign || null,
    })),
  };
}

function ranked(totals: Map<string, number>) {
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, TOP_N);
}

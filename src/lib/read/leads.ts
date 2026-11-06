import { addDays, toDateString } from "@/lib/dates";
import type { ReaderClient } from "@/lib/supabase/types";

export type CompanyVisit = {
  company: string | null;
  title: string | null;
  captured_url: string | null;
  referrer: string | null;
  captured_at: string;
};

export type FormCaptureRow = {
  form_id: string;
  intent: string | null;
  page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  submitted_at: string | null;
  received_at: string;
};

/** A read that failed, or a table this role may not read, is reported, never shown as zero. */
export type Readable<T> = { available: true; rows: T[] } | { available: false; reason: string };

function endExclusive(end: string): string {
  return `${toDateString(addDays(new Date(`${end}T00:00:00Z`), 1))}T00:00:00Z`;
}

/**
 * RB2B company visits for one site. Only company-level columns are read.
 * The LinkedIn URL and raw payload stay in the table.
 */
export async function readCompanyVisits(
  supabase: ReaderClient,
  siteId: string,
  start: string,
  end: string,
): Promise<Readable<CompanyVisit>> {
  const { data, error } = await supabase
    .from("rb2b_visitors")
    .select("company, title, captured_url, referrer, captured_at")
    .eq("site_id", siteId)
    .gte("captured_at", `${start}T00:00:00Z`)
    .lt("captured_at", endExclusive(end))
    .order("captured_at", { ascending: false });
  if (error) return { available: false, reason: `RB2B visits could not be read: ${error.message}` };
  return { available: true, rows: (data ?? []) as CompanyVisit[] };
}

/** Anonymous form captures for one site, matched on its domain with or without www. */
export async function readFormCaptures(
  supabase: ReaderClient,
  domain: string,
  start: string,
  end: string,
): Promise<Readable<FormCaptureRow>> {
  const bare = domain.replace(/^www\./, "");
  const { data, error } = await supabase
    .from("form_captures")
    .select(
      "form_id, intent, page_url, utm_source, utm_medium, utm_campaign, submitted_at, received_at",
    )
    .in("site_domain", [bare, `www.${bare}`])
    .gte("received_at", `${start}T00:00:00Z`)
    .lt("received_at", endExclusive(end))
    .order("received_at", { ascending: false });
  if (error) {
    const denied = error.code === "42501" || /permission denied/i.test(error.message);
    return {
      available: false,
      reason: denied
        ? "Form captures are stored, but dashboard users do not have read access to them yet."
        : `Form captures could not be read: ${error.message}`,
    };
  }
  return { available: true, rows: (data ?? []) as FormCaptureRow[] };
}

/** Path only, so a query string on a captured URL is never shown. */
export function pathOf(url: string | null): string {
  if (!url) return "(unknown)";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url.split("?")[0] || "(unknown)";
  }
}

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

import { missingRelation } from "./respond";
import { normalisePath } from "./page-detail";
import type { Window } from "./compare";
import type { ReaderClient } from "@/lib/supabase/types";

/**
 * Stored context for one page beyond its numbers: what the page says about
 * itself, and links to Clarity replays of visits to it.
 */

export type PageMetaView = {
  title: string | null;
  description: string | null;
  h1: string | null;
  canonicalUrl: string | null;
  url: string | null;
  statusCode: number | null;
  error: string | null;
  fetchedAt: string | null;
  checkedAt: string;
};

export type RecordingView = {
  sessionId: string;
  startedAt: string | null;
  durationSeconds: number | null;
  pageCount: number | null;
  clickCount: number | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  referrer: string | null;
  entryUrl: string | null;
  exitUrl: string | null;
  recordingUrl: string | null;
  /** Clarity keeps replays for 30 days unless they are saved as favourites. */
  likelyExpired: boolean;
};

type Unavailable = { available: false; reason: string };

const RECORDINGS_SHOWN = 25;
const CLARITY_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export async function readPageMeta(
  supabase: ReaderClient,
  siteId: string,
  path: string,
): Promise<{ available: true; meta: PageMetaView | null } | Unavailable> {
  const candidates = [...new Set([path, normalisePath(path) ?? path])];
  const { data, error } = await supabase
    .from("page_meta")
    .select("page_path, title, description, h1, canonical_url, url, status_code, error, fetched_at, checked_at")
    .eq("site_id", siteId)
    .in("page_path", candidates);
  if (error) {
    return {
      available: false,
      reason: missingRelation(error) ? "Page titles and descriptions are not collected yet." : `Page info could not be read: ${error.message}`,
    };
  }
  const row = (data ?? []).find((item) => item.page_path === path) ?? data?.[0];
  if (!row) return { available: true, meta: null };
  return {
    available: true,
    meta: {
      title: row.title,
      description: row.description,
      h1: row.h1,
      canonicalUrl: row.canonical_url,
      url: row.url,
      statusCode: row.status_code,
      error: row.error,
      fetchedAt: row.fetched_at,
      checkedAt: row.checked_at,
    },
  };
}

export async function readPageRecordings(
  supabase: ReaderClient,
  siteId: string,
  path: string,
  window: Window,
  clarityConnected: boolean,
  now: Date = new Date(),
): Promise<{ available: true; total: number; rows: RecordingView[] } | Unavailable> {
  if (!clarityConnected) return { available: false, reason: "Clarity is not connected for this site." };
  const target = normalisePath(path) ?? path;

  const [matches, any] = await Promise.all([
    supabase
      .from("clarity_recordings")
      .select(
        "session_id, started_at, duration_seconds, page_count, click_count, device, browser, country, referrer, entry_url, exit_url, recording_url",
      )
      .eq("site_id", siteId)
      .contains("visited_paths", [target])
      .gte("started_at", `${window.start}T00:00:00Z`)
      .lte("started_at", `${window.end}T23:59:59.999Z`)
      .order("started_at", { ascending: false })
      .limit(RECORDINGS_SHOWN),
    supabase.from("clarity_recordings").select("session_id").eq("site_id", siteId).limit(1),
  ]);

  const error = matches.error ?? any.error;
  if (error) {
    return {
      available: false,
      reason: missingRelation(error)
        ? "Recording links are not collected yet."
        : `Recording links could not be read: ${error.message}`,
    };
  }
  if ((any.data ?? []).length === 0) {
    return { available: false, reason: "Recording links are not collected yet. They are stored by the daily Clarity pull." };
  }

  return {
    available: true,
    total: (matches.data ?? []).length,
    rows: (matches.data ?? []).map((row) => ({
      sessionId: row.session_id,
      startedAt: row.started_at,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      pageCount: row.page_count,
      clickCount: row.click_count,
      device: row.device,
      browser: row.browser,
      country: row.country,
      referrer: row.referrer,
      entryUrl: row.entry_url,
      exitUrl: row.exit_url,
      recordingUrl: row.recording_url,
      likelyExpired: row.started_at
        ? now.getTime() - new Date(row.started_at).getTime() > CLARITY_RETENTION_DAYS * DAY_MS
        : false,
    })),
  };
}

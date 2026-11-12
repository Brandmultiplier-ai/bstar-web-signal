import { createHash } from "node:crypto";

import { normalisePath } from "../read/page-detail";
import type { ClarityRecording, Site } from "../database.types";

/**
 * Folds a Clarity recordings response into rows. The response shape is not
 * documented, so every field is looked up under the names it is likely to
 * have, and the whole session object is kept in `raw` to correct the mapping
 * once a real response has been stored. Pure: tested on fixtures.
 */

export type RecordingRow = Omit<ClarityRecording, "collected_at">;

type Json = Record<string, unknown>;

const LIST_KEYS = ["sessions", "recordings", "data", "items", "value", "results", "sessionRecordings"];
const CLARITY_HOST = /^https:\/\/([a-z0-9-]+\.)*clarity\.(microsoft\.com|ms)\//i;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** The array of session objects, wherever it sits in the response. */
export function findSessionList(raw: unknown): Json[] | null {
  const objects = (value: unknown) => (Array.isArray(value) ? value.filter(isObject) : null);
  if (Array.isArray(raw)) return objects(raw);
  if (!isObject(raw)) return null;
  for (const key of LIST_KEYS) {
    const hit = Object.entries(raw).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
    if (Array.isArray(hit)) return objects(hit);
    if (isObject(hit)) {
      const nested = findSessionList(hit);
      if (nested) return nested;
    }
  }
  const firstArray = Object.values(raw).find((value) => Array.isArray(value) && value.some(isObject));
  return firstArray ? objects(firstArray) : null;
}

/** Top-level shape for a run note: key names only, never values. */
export function describeShape(raw: unknown): string {
  if (Array.isArray(raw)) return `array of ${raw.length}`;
  if (isObject(raw)) return `object with keys ${Object.keys(raw).slice(0, 12).join(", ") || "(none)"}`;
  return typeof raw;
}

function pick(session: Json, names: string[]): unknown {
  const entries = Object.entries(session);
  for (const name of names) {
    const hit = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (hit && hit[1] !== null && hit[1] !== undefined && hit[1] !== "") return hit[1];
  }
  return undefined;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (isObject(value)) return text(pick(value, ["name", "value", "label"]));
  return null;
}

function count(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e11 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/** Seconds from a number, an `hh:mm:ss` string, or a field named in milliseconds. */
function duration(session: Json): number | null {
  const ms = pick(session, ["durationMs", "durationInMs", "durationMilliseconds", "sessionDurationMs"]);
  if (ms !== undefined) {
    const value = Number(ms);
    return Number.isFinite(value) ? value / 1000 : null;
  }
  const value = pick(session, ["durationSeconds", "durationInSeconds", "sessionDuration", "duration"]);
  if (typeof value === "string" && /^\d{1,2}(:\d{2}){1,2}$/.test(value.trim())) {
    return value
      .trim()
      .split(":")
      .map(Number)
      .reduce((total, part) => total * 60 + part, 0);
  }
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n >= 0 ? n : null;
}

/** A link to the replay: a named field first, else any Clarity URL in the object. */
function recordingUrl(session: Json): string | null {
  const named = text(
    pick(session, ["sessionLink", "recordingUrl", "recordingLink", "playbackUrl", "playbackLink", "sessionUrl", "link"]),
  );
  if (named && /^https:\/\//i.test(named)) return named;
  for (const value of Object.values(session)) {
    if (typeof value === "string" && CLARITY_HOST.test(value)) return value;
  }
  return null;
}

function urlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : isObject(item) ? text(pick(item, ["url", "pageUrl", "href", "path"])) : null))
    .filter((item): item is string => Boolean(item));
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function parseRecordings(
  raw: unknown,
  context: { projectId: string; sites: Site[] },
): { rows: RecordingRow[]; listFound: boolean; shape: string } {
  const list = findSessionList(raw);
  if (!list) return { rows: [], listFound: false, shape: describeShape(raw) };

  const projectSites = context.sites.filter((site) => site.clarity_project_id === context.projectId);
  const siteFor = (host: string | null) =>
    (host && context.sites.find((site) => site.domain.toLowerCase().replace(/^www\./, "") === host)?.id) ||
    (projectSites.length === 1 ? projectSites[0]!.id : null);

  const rows = new Map<string, RecordingRow>();
  for (const session of list) {
    const link = recordingUrl(session);
    const id =
      text(pick(session, ["sessionId", "sessionID", "session_id", "recordingId", "id"])) ??
      link ??
      createHash("sha1").update(JSON.stringify(session)).digest("hex");
    const entry = text(pick(session, ["entryUrl", "entryPage", "landingPage", "landingUrl", "firstUrl", "startUrl"]));
    const exit = text(pick(session, ["exitUrl", "exitPage", "lastUrl", "endUrl"]));
    const visited = urlList(pick(session, ["visitedUrls", "visitedPages", "pageUrls", "urls", "pages"]));
    const paths = [...new Set([entry, exit, ...visited].map((url) => normalisePath(url)).filter((p): p is string => Boolean(p)))];
    const pagesField = pick(session, ["pageCount", "pagesCount", "pageViews", "pages"]);

    rows.set(id, {
      clarity_project_id: context.projectId,
      session_id: id.slice(0, 512),
      site_id: siteFor(hostOf(entry) ?? hostOf(visited[0] ?? null) ?? hostOf(exit)),
      started_at: timestamp(pick(session, ["startTime", "sessionStart", "sessionStartTime", "startedAt", "start", "timestamp", "date"])),
      duration_seconds: duration(session),
      entry_url: entry,
      exit_url: exit,
      visited_paths: paths,
      page_count: Array.isArray(pagesField) ? pagesField.length : count(pagesField),
      click_count: count(pick(session, ["clickCount", "clicks", "sessionClickCount", "totalClicks", "clicksCount"])),
      device: text(pick(session, ["deviceType", "device"])),
      browser: text(pick(session, ["browser", "browserName"])),
      country: text(pick(session, ["country", "countryName", "location"])),
      referrer: text(pick(session, ["referrer", "referringUrl", "referrerUrl", "referrer_url"])),
      recording_url: link,
      raw: session,
    });
  }
  return { rows: [...rows.values()], listFound: true, shape: describeShape(raw) };
}

/** Yesterday in UTC, as the ISO bounds the endpoint expects. */
export function recordingWindow(date: string): { start: string; end: string } {
  return { start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.999Z` };
}

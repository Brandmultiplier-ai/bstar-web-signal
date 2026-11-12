"use client";

import { PlayCircle } from "lucide-react";

import { normalisePath } from "@/lib/read/page-detail";
import { SubHeading, formatDuration } from "@/components/ui";
import type { PageDetailResponse } from "@/lib/api-types";

const MANUAL =
  "To watch visits to this page by hand: open Clarity, go to Recordings, then Filters, then Visited URL, and paste the page URL.";

/** Latest stored Clarity sessions that visited this page, each linking to its replay in Clarity. */
export function PageRecordings({ data }: { data: PageDetailResponse }) {
  const recordings = data.recordings;
  const info = [
    "Sessions Clarity recorded that included this page, newest first, from the daily Clarity pull (up to 250 sessions per site per day).",
    "Replays open in Clarity and need a Clarity login. Clarity keeps replays for 30 days unless they are saved as favourites.",
  ];

  if (!recordings.available) {
    return (
      <section>
        <SubHeading title="Recordings" info={info} />
        <p className="text-sm text-[var(--nos-text-muted)]">{recordings.reason}</p>
        {data.site.clarityProjectId && <p className="mt-1 text-xs text-[var(--nos-text-muted)]">{MANUAL}</p>}
      </section>
    );
  }

  const target = normalisePath(data.path);
  return (
    <section>
      <SubHeading title={`Recordings (${recordings.total.toLocaleString("en-US")})`} info={info} />
      {recordings.rows.length === 0 ? (
        <>
          <p className="text-sm text-[var(--nos-text-muted)]">No stored recordings include this page in this range.</p>
          <p className="mt-1 text-xs text-[var(--nos-text-muted)]">{MANUAL}</p>
        </>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)]">
          {recordings.rows.map((row) => {
            const entered = normalisePath(row.entryUrl) === target;
            const facts = [
              row.durationSeconds !== null ? formatDuration(row.durationSeconds) : null,
              row.pageCount !== null ? `${row.pageCount} page${row.pageCount === 1 ? "" : "s"}` : null,
              row.clickCount !== null ? `${row.clickCount} click${row.clickCount === 1 ? "" : "s"}` : null,
              row.device,
              row.browser,
              row.country,
            ].filter(Boolean);
            return (
              <li key={row.sessionId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-white">
                    {row.startedAt ? formatWhen(row.startedAt) : "Start time not recorded"}
                    {entered && (
                      <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--nos-text-secondary)]">
                        Started here
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--nos-text-secondary)]">
                    {facts.join(" · ") || "No session details"}
                    {row.referrer ? ` · from ${row.referrer}` : ""}
                  </p>
                </div>
                {row.recordingUrl ? (
                  <a
                    href={row.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/5 px-2.5 py-1.5 text-xs text-white hover:bg-white/10"
                    title={row.likelyExpired ? "Older than 30 days: Clarity has likely deleted this replay." : "Opens in Clarity"}
                  >
                    <PlayCircle size={14} /> {row.likelyExpired ? "Likely expired" : "Watch in Clarity"}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-[var(--nos-text-muted)]">No replay link</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

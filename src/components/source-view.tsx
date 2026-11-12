"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { useSourceDetail } from "@/lib/hooks";
import { formatLongDate } from "@/lib/dates";
import { pageViewHref } from "@/lib/view-links";
import { DetailShell, useDetailContext } from "@/components/detail-shell";
import { DailyLines, Tile } from "@/components/page-detail-body";
import { PagePath } from "@/components/page-path";
import {
  PanelSkeleton,
  RefreshBar,
  SimpleTable,
  SubHeading,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/components/ui";
import type { SourceDetailResponse } from "@/lib/api-types";

const KIND_LABEL: Record<SourceDetailResponse["label"]["kind"], string> = {
  direct: "Direct",
  email: "Email",
  search: "Search",
  ai: "AI assistant",
  social: "Social",
  referral: "Link on another site",
  internal: "Internal",
  testing: "Testing",
  unknown: "Unrecognised",
};

/** Full, shareable view of one traffic source: how much it sends and where those visitors land. */
export function SourceView() {
  const params = useSearchParams();
  const router = useRouter();
  const source = params.get("source");
  const medium = params.get("medium");
  const { site, range, isLoading: sitesLoading, error: siteError } = useDetailContext();
  const { data, isLoading, isFetching, error } = useSourceDetail(site?.id, source, medium, range);
  const shown = data && data.source === source && data.medium === medium ? data : null;

  return (
    <DetailShell
      trail={["Sources", site?.displayName ?? "…", shown?.label.name ?? `${source ?? ""} / ${medium ?? ""}`]}
      isLoading={sitesLoading}
      error={source === null || medium === null ? "No source given. Open a source from the dashboard." : siteError}
    >
      {site && source !== null && medium !== null && (
        <div className="space-y-8">
          {isFetching && shown && <RefreshBar />}
          {!shown ? (
            isLoading || isFetching ? (
              <PanelSkeleton tiles={3} />
            ) : (
              <p className="text-sm text-[var(--nos-negative)]">
                {error instanceof Error ? error.message : "Something went wrong."}
              </p>
            )
          ) : (
            <>
              <div>
                <p className="text-label-caps">Traffic source · {site.domain}</p>
                <h1 className="mt-1 text-[26px] font-bold leading-tight text-white">{shown.label.name}</h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[var(--nos-text-secondary)]">
                  <span className="rounded-full border border-[var(--border)] bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {KIND_LABEL[shown.label.kind]}
                  </span>
                  <span title="Source / medium exactly as Google Analytics stores it">{shown.label.raw}</span>
                </p>
              </div>

              <section>
                <SubHeading title="In plain English" info="Written from the stored numbers below, by fixed rules." />
                <ul className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)] px-4 py-3.5">
                  {shown.summary.map((text) => (
                    <li key={text} className="flex gap-2.5 text-sm leading-relaxed text-[var(--nos-text-secondary)]">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: "var(--nos-accent)" }} />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <SubHeading
                  title="Visits from this source"
                  info="Google Analytics, for the whole site, compared with the same number of days just before."
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Tile label="Visits" value={count(shown.kpis.sessions.current)} delta={shown.kpis.sessions} />
                  <Tile
                    label="People"
                    value={count(shown.kpis.users.current)}
                    delta={shown.kpis.users}
                    tip="Summed per day, so a returning person can count more than once."
                  />
                  <Tile
                    label="Share of all visits"
                    value={formatPercent(shown.kpis.share.current)}
                    delta={shown.kpis.share}
                    tip="This source's visits as a share of every visit to the site in the range."
                  />
                </div>
              </section>

              {shown.coverage.storedDays > 0 && (
                <section>
                  <SubHeading title="Visits by day" info="Gaps are days with no stored visits from this source." />
                  <DailyLines daily={shown.daily} height={220} lines={[{ key: "sessions", name: "Visits", color: "#7551ff" }]} />
                </section>
              )}

              <section>
                <SubHeading
                  title="Pages these visitors landed on"
                  info={[
                    "The first page of each visit from this source. Click a page for its full view.",
                    "Engagement, bounce and session length are for every visit that started on the page, from any source.",
                  ]}
                />
                {shown.pages.available ? (
                  <SimpleTable
                    rows={shown.pages.rows}
                    empty="No landing pages stored for this source in this range."
                    onRowClick={(row) => router.push(pageViewHref(site.slug, row.path, range))}
                    columns={[
                      { header: "Page", cell: (row) => <PagePath siteSlug={site.slug} path={row.path} />, sortValue: (row) => row.path },
                      { header: "Visits", align: "right", cell: (row) => formatNumber(row.sessions), sortValue: (row) => row.sessions },
                      { header: "Share", align: "right", cell: (row) => formatPercent(row.share, 0), sortValue: (row) => row.share },
                      {
                        header: "Page engagement",
                        align: "right",
                        cell: (row) => formatPercent(row.pageEngagementRate),
                        sortValue: (row) => row.pageEngagementRate,
                      },
                      {
                        header: "Page bounce",
                        align: "right",
                        cell: (row) => formatPercent(row.pageBounceRate),
                        sortValue: (row) => row.pageBounceRate,
                      },
                      {
                        header: "Session length",
                        align: "right",
                        cell: (row) => formatDuration(row.pageAvgSessionDuration),
                        sortValue: (row) => row.pageAvgSessionDuration,
                      },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-[var(--nos-text-muted)]">{shown.pages.reason}</p>
                )}
                {shown.pages.available && shown.landingsSince && shown.landingsSince > shown.range.start && (
                  <p className="mt-2 text-xs text-[var(--nos-text-muted)]">
                    Landing pages per source collected since {formatLongDate(shown.landingsSince)}.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </DetailShell>
  );
}

function count(value: number | null): string {
  return value === null ? "—" : formatNumber(Math.round(value));
}

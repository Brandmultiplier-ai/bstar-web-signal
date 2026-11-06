"use client";

import { CalendarDays } from "lucide-react";

import { useCalendly } from "@/lib/hooks";
import {
  Panel,
  SubHeading,
  QueryState,
  RankList,
  SimpleTable,
  Stat,
  StatGrid,
  formatNumber,
} from "@/components/ui";
import { HistogramBar } from "@/website-signals-kit/components/charts/HistogramBar";
import type { DateFilter } from "@/store/dashboard-store";
import { REPORT_BLURBS, SOURCE_WINDOW_NOTES } from "@/lib/summaries";

const CLASS_LABEL = {
  primary: "Primary",
  partner: "Partner",
  relay: "Founder-relayed",
  excluded: "Excluded",
} as const;

const REASON_LABEL = {
  test: "Test or placeholder",
  "company-domain": "Company domain",
  "outside-taxonomy": "Not a conversion type",
} as const;

function countBy<T>(rows: T[], key: (row: T) => string) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + 1);
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 10);
}

export function CalendlySection({ range }: { range: DateFilter }) {
  const { data, isLoading, isFetching, error } = useCalendly(range);
  const active = (data?.bookings ?? []).filter((row) => row.status !== "canceled");
  const primaryByDay = (data?.series ?? [])
    .filter((row) => row.conversionClass === "primary")
    .map((row) => ({ date: row.date, sessions: row.bookings }));

  return (
    <Panel
      refreshing={Boolean(data) && isFetching}
      title="Conversions"
      subtitle="Counted by the day the booking was created. A reschedule counts once, on the original day. Primary, Partner, and Founder-relayed are never added together."
      note={SOURCE_WINDOW_NOTES.calendly}
      info={[
        REPORT_BLURBS.calendly,
        data
          ? `${formatNumber(data.totals.excluded)} rows in this range are excluded (tests, company domains, personal calendar, interviews, and event types outside the taxonomy). ${
              data.totals.attributionGaps > 0
                ? `${formatNumber(data.totals.attributionGaps)} Primary or Partner bookings have no UTM.`
                : "No Primary or Partner booking in this range is missing a UTM."
            } Founder-relayed bookings without a UTM are not an attribution failure.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      source="calendly"
      freshness={data?.freshness}
      icon={CalendarDays}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">
          <StatGrid>
            <Stat
              label="Primary"
              value={formatNumber(data.totals.primary)}
              hint="Storyline and Diagnostic. Managed against this number."
            />
            <Stat
              label="Partner"
              value={formatNumber(data.totals.partner)}
              hint="Connector Fit Call. Not part of Primary."
            />
            <Stat
              label="Founder-relayed"
              value={formatNumber(data.totals.relay)}
              hint="Quick Chat. No UTM is expected — the link is handed out directly."
            />
            <Stat
              label="Cancelled"
              value={formatNumber(data.totals.cancelled)}
              hint="Booked, then cancelled. Reported here, not inside the totals above."
            />
          </StatGrid>

          {primaryByDay.length > 1 && (
            <HistogramBar
              data={primaryByDay}
              title="Primary bookings by day"
              subtitle="Counted on the day the booking was created"
              names={{ sessions: "Primary" }}
              height={200}
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <RankList
              title="By event type"
              info="Booked calls in this range by Calendly event type. Cancelled bookings are left out."
              rows={countBy(active, (row) => row.eventName ?? "(unnamed)")}
              empty="No booked calls in this range."
            />
            <RankList
              title="By UTM source"
              info="Primary and Partner bookings by UTM source. Founder-relayed calls are left out because they carry no UTM by design."
              rows={countBy(
                active.filter((row) => row.conversionClass !== "relay"),
                (row) => row.utmSource ?? "(no UTM)",
              )}
              empty="No Primary or Partner bookings in this range."
            />
          </div>

          {data.byProperty.length > 0 && (
            <div>
              <SubHeading
                title="Primary by property"
                info="Primary bookings split by the site whose booking page was used."
              />
              <SimpleTable
                rows={data.byProperty}
                columns={[
                  { header: "Property", cell: (row) => row.property },
                  {
                    header: "Bookings",
                    align: "right",
                    cell: (row) => formatNumber(row.bookings),
                  },
                ]}
              />
            </div>
          )}

          <div>
            <SubHeading
              title="Primary and Partner by attribution"
              info="Founder-relayed bookings are left out of this table. A blank UTM on Quick Chat is the normal case."
            />
            <SimpleTable
              rows={data.byAttribution}
              empty="No Primary or Partner bookings in this range."
              columns={[
                {
                  header: "Class",
                  cell: (row) => CLASS_LABEL[row.conversionClass],
                },
                { header: "Source", cell: (row) => row.source },
                { header: "Medium", cell: (row) => row.medium },
                { header: "Campaign", cell: (row) => row.campaign },
                {
                  header: "Bookings",
                  align: "right",
                  cell: (row) => formatNumber(row.bookings),
                },
              ]}
            />
          </div>

          <div>
            <SubHeading
              title="Bookings"
              info="Every counted and cancelled booking in this range. Click a column header to sort."
            />
            <SimpleTable
              rows={data.bookings}
              empty="No conversions in this range."
              columns={[
                { header: "Created", cell: (row) => row.countedOn, sortValue: (row) => row.countedOn },
                {
                  header: "Class",
                  cell: (row) => CLASS_LABEL[row.conversionClass],
                  sortValue: (row) => row.conversionClass,
                },
                { header: "Property", cell: (row) => row.property ?? "—", sortValue: (row) => row.property },
                { header: "Event", cell: (row) => row.eventName ?? "—", sortValue: (row) => row.eventName },
                { header: "Invitee", cell: (row) => row.inviteeName ?? "—" },
                { header: "Source", cell: (row) => row.utmSource ?? "—", sortValue: (row) => row.utmSource },
                { header: "Term", cell: (row) => row.utmTerm ?? "—" },
                { header: "Status", cell: (row) => row.status ?? "—", sortValue: (row) => row.status },
              ]}
            />
          </div>

          {data.byExclusion.length > 0 && (
            <div>
              <SubHeading
                title="Excluded from every count"
                info="Bookings left out of every total above: tests, company-domain invitees, and event types that are not conversions."
              />
              <SimpleTable
                rows={data.byExclusion}
                columns={[
                  {
                    header: "Reason",
                    cell: (row) =>
                      REASON_LABEL[row.reason as keyof typeof REASON_LABEL] ?? row.reason,
                  },
                  { header: "Event", cell: (row) => row.eventName },
                  {
                    header: "Rows",
                    align: "right",
                    cell: (row) => formatNumber(row.bookings),
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

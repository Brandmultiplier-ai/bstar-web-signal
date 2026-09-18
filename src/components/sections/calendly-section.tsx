"use client";

import { CalendarDays } from "lucide-react";

import { useCalendly } from "@/lib/hooks";
import {
  InsightCard,
  Panel,
  QueryState,
  SimpleTable,
  Stat,
  StatGrid,
  formatNumber,
} from "@/components/ui";
import type { DateFilter } from "@/store/dashboard-store";
import { REPORT_BLURBS, SOURCE_WINDOW_NOTES } from "@/lib/summaries";

export function CalendlySection({ range }: { range: DateFilter }) {
  const { data, isLoading, error } = useCalendly(range);

  return (
    <Panel
      title="Calendly bookings"
      subtitle="Bookings are stored and kept. Date chips filter those rows — they never call Calendly. The booking link is shared, so attribution is by UTM rather than domain."
      note={SOURCE_WINDOW_NOTES.calendly}
      source="calendly"
      freshness={data?.freshness}
      icon={CalendarDays}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">
          <InsightCard
            title="What this report is"
            body={REPORT_BLURBS.calendly}
          />
          <StatGrid>
            <Stat label="Bookings" value={formatNumber(data.totals.bookings)} />
            <Stat
              label="With UTM"
              value={formatNumber(data.totals.attributed)}
              hint={`${formatNumber(data.totals.bookings - data.totals.attributed)} unattributed`}
            />
            <Stat label="Cancelled" value={formatNumber(data.totals.cancelled)} />
          </StatGrid>

          <div>
            <h3 className="mb-2 text-xs font-medium text-[var(--color-ink-muted)]">
              By attribution
            </h3>
            <SimpleTable
              rows={data.byAttribution}
              columns={[
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
            <h3 className="mb-2 text-xs font-medium text-[var(--color-ink-muted)]">Bookings</h3>
            <SimpleTable
              rows={data.bookings}
              columns={[
                {
                  header: "Scheduled",
                  cell: (row) => new Date(row.scheduledAt).toLocaleString(),
                },
                { header: "Invitee", cell: (row) => row.inviteeName ?? "—" },
                { header: "Event", cell: (row) => row.eventName ?? "—" },
                { header: "Source", cell: (row) => row.utmSource ?? "—" },
                { header: "Campaign", cell: (row) => row.utmCampaign ?? "—" },
                { header: "Status", cell: (row) => row.status ?? "—" },
              ]}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

"use client";

import { Building2 } from "lucide-react";

import { useLeads } from "@/lib/hooks";
import {
  DataNote,
  InsightCard,
  Panel,
  QueryState,
  RankList,
  SimpleTable,
  Stat,
  StatGrid,
  formatNumber,
} from "@/components/ui";
import { HistogramBar } from "@/website-signals-kit/components/charts/HistogramBar";
import type { LeadsResponse, SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";

export function LeadsSection({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const { data, isLoading, isFetching, error } = useLeads(site.id, range);

  return (
    <Panel
      refreshing={Boolean(data) && isFetching}
      title="Leads"
      subtitle={`Companies RB2B identified on ${site.domain}, and anonymous form submissions. No visitor names or emails are stored or shown.`}
      icon={Building2}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-8">
          <InsightCard
            title="What this report is"
            body="RB2B names the company behind some visits. Form submissions come from the site's own capture webhook. Both arrive in real time, so there is no scheduled pull."
            insight={leadLine(data)}
          />
          <Companies companies={data.companies} />
          <Forms forms={data.forms} />
        </div>
      )}
    </Panel>
  );
}

function leadLine(data: LeadsResponse): string {
  const parts: string[] = [];
  if (data.companies.available) {
    parts.push(
      `${formatNumber(data.companies.totals.companies)} companies identified across ${formatNumber(data.companies.totals.visits)} visits`,
    );
  }
  if (data.forms.available) {
    parts.push(`${formatNumber(data.forms.totals.submissions)} form submissions`);
  }
  return parts.length ? `${parts.join(" and ")} in this range.` : "Neither lead source could be read.";
}

function Unavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-white">{title}</h3>
      <DataNote>{reason} This is not a zero.</DataNote>
    </div>
  );
}

function Companies({ companies }: { companies: LeadsResponse["companies"] }) {
  if (!companies.available) return <Unavailable title="Companies" reason={companies.reason} />;
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-white">Companies</h3>
      <StatGrid>
        <Stat label="Companies" value={formatNumber(companies.totals.companies)} />
        <Stat label="Identified visits" value={formatNumber(companies.totals.visits)} />
        <Stat
          label="No company"
          value={formatNumber(companies.totals.unidentifiedVisits)}
          hint="Visits RB2B matched without a company"
        />
      </StatGrid>

      {companies.series.length > 1 && (
        <HistogramBar
          data={companies.series.map((row) => ({ date: row.date, sessions: row.visits }))}
          title="Identified visits per day"
          names={{ sessions: "Visits" }}
        />
      )}

      <SimpleTable
        rows={companies.companies}
        empty="RB2B has not identified a company in this range."
        columns={[
          { header: "Company", cell: (row) => row.company, sortValue: (row) => row.company },
          {
            header: "Visits",
            align: "right",
            cell: (row) => formatNumber(row.visits),
            sortValue: (row) => row.visits,
          },
          { header: "Roles seen", cell: (row) => row.titles.join(", ") || "—" },
          { header: "Pages", cell: (row) => row.pages.join(", ") },
          {
            header: "Last seen",
            align: "right",
            cell: (row) => row.lastSeen.slice(0, 10),
            sortValue: (row) => row.lastSeen,
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RankList title="Pages they viewed" rows={companies.topPages} />
        <RankList title="Where they came from" rows={companies.referrers} />
      </div>
    </div>
  );
}

function Forms({ forms }: { forms: LeadsResponse["forms"] }) {
  if (!forms.available) return <Unavailable title="Form submissions" reason={forms.reason} />;
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-white">Form submissions</h3>
      <StatGrid>
        <Stat label="Submissions" value={formatNumber(forms.totals.submissions)} />
        <Stat label="Forms used" value={formatNumber(forms.byForm.length)} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <RankList title="By form" rows={forms.byForm} />
        <RankList title="By page" rows={forms.byPage} />
        <RankList title="By source / medium" rows={forms.bySource} />
      </div>

      <SimpleTable
        rows={forms.recent}
        empty="No form submissions in this range."
        columns={[
          { header: "When", cell: (row) => row.at.slice(0, 16).replace("T", " "), sortValue: (row) => row.at },
          { header: "Form", cell: (row) => row.formId, sortValue: (row) => row.formId },
          { header: "Page", cell: (row) => row.page },
          {
            header: "Source",
            cell: (row) =>
              row.source ? [row.source, row.medium, row.campaign].filter(Boolean).join(" / ") : "(none)",
          },
        ]}
      />
    </div>
  );
}

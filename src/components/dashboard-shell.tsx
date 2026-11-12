"use client";

import { startTransition, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  LogOut,
  MousePointerClick,
  Search,
  Sparkles,
} from "lucide-react";

import { prefetchView, useSites, useSummary, type ReportView } from "@/lib/hooks";
import { dateFilterFromStore, useDashboardStore, type DateFilter } from "@/store/dashboard-store";
import { useDashboardViewStore } from "@/store/dashboard-view-store";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { DateRangePicker } from "@/components/date-range-picker";
import { Breadcrumbs, GradientRule, IconTile } from "@/components/vision";
import { Ga4Section } from "@/components/sections/ga4-section";
import { GscSection } from "@/components/sections/gsc-section";
import { ClaritySection } from "@/components/sections/clarity-section";
import { CalendlySection } from "@/components/sections/calendly-section";
import { WebsiteSignalsSection } from "@/components/sections/website-signals-section";
import { SummarySection } from "@/components/sections/summary-section";
import { LeadsSection } from "@/components/sections/leads-section";
import { PageDrillDrawer } from "@/components/page-drill-drawer";
import { describeFreshness, PanelSkeleton, type FreshnessState } from "@/components/ui";
import type { SiteSummary, SummaryResponse } from "@/lib/api-types";

type View = ReportView;

const VIEWS: Array<{
  id: View;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "summary", label: "Business summary", hint: "All sources at a glance", icon: Gauge },
  { id: "signals", label: "Traffic snapshot", hint: "Website signals", icon: LayoutDashboard },
  { id: "ga4", label: "Analytics", hint: "Google Analytics", icon: BarChart3 },
  { id: "gsc", label: "Search", hint: "Search Console", icon: Search },
  { id: "clarity", label: "Behavior", hint: "Microsoft Clarity", icon: MousePointerClick },
  { id: "calendly", label: "Conversions", hint: "Calendly", icon: CalendarDays },
  { id: "leads", label: "Leads", hint: "RB2B and forms", icon: Building2 },
];

/** Every report except the one on screen, warmed one at a time after the first paint. */
const WARM_VIEWS: View[] = ["ga4", "gsc", "signals", "clarity", "calendly", "leads"];

export function DashboardShell() {
  const { data: sites, isLoading, error } = useSites();
  const {
    selectedSiteSlug,
    setSelectedSiteSlug,
    rangeDays,
    allTime,
    customStart,
    customEnd,
  } = useDashboardStore();
  const range = dateFilterFromStore({ rangeDays, allTime, customStart, customEnd });
  const view = useDashboardViewStore((state) => state.view);
  const setView = useDashboardViewStore((state) => state.setView);
  const queryClient = useQueryClient();

  const selectedSite = useMemo(() => {
    if (!sites?.length) return undefined;
    return sites.find((site) => site.slug === selectedSiteSlug) ?? sites[0];
  }, [sites, selectedSiteSlug]);

  useEffect(() => {
    if (selectedSite && selectedSite.slug !== selectedSiteSlug) {
      setSelectedSiteSlug(selectedSite.slug);
    }
  }, [selectedSite, selectedSiteSlug, setSelectedSiteSlug]);

  const siteId = selectedSite?.id;
  const rangeKey = JSON.stringify(range);
  useEffect(() => {
    if (!siteId) return;
    // After the visible report has had its turn, warm the next likely tabs.
    const timers = WARM_VIEWS.map((next, index) =>
      setTimeout(() => prefetchView(queryClient, next, siteId, JSON.parse(rangeKey)), 1500 + index * 400),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [queryClient, siteId, rangeKey]);

  const warm = (next: View) => prefetchView(queryClient, next, siteId, range);
  const warmSite = (slug: string) => {
    const next = sites?.find((site) => site.slug === slug);
    if (next) prefetchView(queryClient, view, next.id, range);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <PanelSkeleton />
      </div>
    );
  }

  if (error || !sites?.length) {
    return (
      <p className="p-6 text-sm text-[var(--nos-negative)]">
        {error instanceof Error
          ? error.message
          : "No active sites in the registry. Seed public.sites to get started."}
      </p>
    );
  }

  const activeView = VIEWS.find((item) => item.id === view)!;
  const reportScope =
    view === "calendly" ? "All sites" : selectedSite?.domain ?? "Site";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-width)] shrink-0 flex-col px-5 py-6 lg:flex">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-7 items-center justify-center rounded-lg"
            style={{ background: "var(--vui-gradient-brand)" }}
          >
            <Sparkles size={15} className="text-white" />
          </span>
          <span className="text-sm font-bold uppercase tracking-[0.12em] text-white">
            Web Signals
          </span>
        </div>

        <GradientRule className="my-6" />

        {sites.length > 1 ? (
          <label className="block">
            <span className="text-label-caps">Property</span>
            <select
              value={selectedSite?.slug ?? ""}
              onChange={(event) => {
                warmSite(event.target.value);
                setSelectedSiteSlug(event.target.value);
              }}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--nos-accent)]"
            >
              {sites.map((site) => (
                <option key={site.slug} value={site.slug}>
                  {site.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div>
            <span className="text-label-caps">Property</span>
            <p className="mt-2 truncate text-sm font-semibold text-white">
              {selectedSite?.displayName}
            </p>
          </div>
        )}

        <nav className="mt-7 flex-1 space-y-1.5 overflow-y-auto">
          <p className="text-label-caps mb-3">Reports</p>
          {VIEWS.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => startTransition(() => setView(item.id))}
                onMouseEnter={() => warm(item.id)}
                onFocus={() => warm(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                  active ? "nos-card !p-3" : "hover:bg-white/5"
                }`}
              >
                <IconTile
                  icon={item.icon}
                  gradient={active ? "brand" : "flat"}
                  size={32}
                  iconSize={15}
                />
                <span className="min-w-0">
                  <span
                    className={`block truncate text-sm ${
                      active ? "font-bold text-white" : "text-[var(--nos-text-secondary)]"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--nos-text-muted)]">
                    {item.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {selectedSite && <FreshnessCard site={selectedSite} range={range} />}

        <button
          onClick={async () => {
            await createBrowserSupabase().auth.signOut();
            window.location.assign("/login");
          }}
          className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--nos-text-secondary)] transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-5 backdrop-blur-xl">
          <div className="min-w-0">
            <Breadcrumbs trail={["Reports", activeView.label]} />
            <h1 className="mt-1 truncate text-[26px] font-bold leading-tight text-white">
              {activeView.label}
            </h1>
            <p className="text-xs text-[var(--nos-text-secondary)]">{reportScope}</p>
          </div>

          <DateRangePicker />
        </header>

        <div className="mx-auto flex w-full max-w-[1600px] gap-2 overflow-x-auto px-6 pb-4 lg:hidden">
          {sites.length > 1 ? (
            <select
              value={selectedSite?.slug ?? ""}
              onChange={(event) => {
                warmSite(event.target.value);
                setSelectedSiteSlug(event.target.value);
              }}
              className="shrink-0 rounded-xl border border-[var(--border)] bg-white/5 px-3 py-2 text-xs text-white outline-none"
            >
              {sites.map((site) => (
                <option key={site.slug} value={site.slug}>
                  {site.displayName}
                </option>
              ))}
            </select>
          ) : null}
          {VIEWS.map((item) => (
            <button
              key={item.id}
              onClick={() => startTransition(() => setView(item.id))}
              onTouchStart={() => warm(item.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs transition-colors ${
                view === item.id
                  ? "font-bold text-white"
                  : "border border-[var(--border)] text-[var(--nos-text-secondary)]"
              }`}
              style={
                view === item.id ? { background: "var(--vui-gradient-brand)" } : undefined
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mx-auto w-full max-w-[1600px] flex-1 px-6 pb-12">
          {view === "summary" && selectedSite && (
            <SummarySection
              site={selectedSite}
              range={range}
              onOpen={(section) => startTransition(() => setView(section))}
              onHover={(section) => warm(section)}
            />
          )}

          {view === "leads" && selectedSite && <LeadsSection site={selectedSite} range={range} />}

          {view === "signals" && selectedSite && (
            <WebsiteSignalsSection site={selectedSite} range={range} />
          )}

          {view === "ga4" && selectedSite && (
            selectedSite.hasGa4 ? (
              <Ga4Section site={selectedSite} range={range} />
            ) : (
              <p className="text-sm text-[var(--nos-text-muted)]">
                {selectedSite.displayName} has no Google Analytics property connected yet.
              </p>
            )
          )}

          {view === "gsc" && selectedSite && (
            <GscSection site={selectedSite} range={range} />
          )}

          {view === "clarity" && <ClaritySection site={selectedSite} range={range} />}
          {view === "calendly" && <CalendlySection range={range} />}
        </div>
      </div>
      {selectedSite && <PageDrillDrawer site={selectedSite} range={range} />}
    </div>
  );
}

const PULL_ROWS: Array<{
  label: string;
  source: "ga4" | "clarity" | "gsc" | "calendly";
  show: (site: SiteSummary) => boolean;
}> = [
  { label: "GA4", source: "ga4", show: (site) => site.hasGa4 },
  { label: "Clarity", source: "clarity", show: (site) => site.hasClarity },
  { label: "Search", source: "gsc", show: (site) => site.hasSearchConsole },
  { label: "Calendly", source: "calendly", show: () => true },
];

function pullRows(site: SiteSummary, freshness: SummaryResponse["freshness"]) {
  return PULL_ROWS.filter((row) => row.show(site)).map((row) => {
    const described = describeFreshness(row.source, freshness[row.source]);
    return { ...row, ...described };
  });
}

function FreshnessCard({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const { data } = useSummary(site.id, range);
  if (!data) return null;
  const rows = pullRows(site, data.freshness);

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--vui-gradient-purple)" }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/70">
        Data freshness
      </p>
      <div className="mt-2.5 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-white/80">{row.label}</span>
            <span
              className="truncate text-xs font-semibold text-white"
              title={row.message}
              style={row.state === "fresh" ? undefined : { color: "#ff5c5c" }}
            >
              {stateWord(row.state)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function stateWord(state: FreshnessState): string {
  if (state === "failing") return "Failed";
  if (state === "stale") return "Overdue";
  if (state === "never") return "No pull yet";
  return "Fresh";
}

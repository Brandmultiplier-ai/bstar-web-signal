"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MousePointerClick,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

import { useSites, useWebsiteSignals } from "@/lib/hooks";
import {
  RANGE_PRESETS,
  dateFilterFromStore,
  dateFilterLabel,
  useDashboardStore,
  type DateFilter,
  type RangePreset,
} from "@/store/dashboard-store";
import { addDays, latestCompleteDay, toDateString } from "@/lib/dates";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Breadcrumbs, GradientRule, IconTile } from "@/components/vision";
import { Ga4Section } from "@/components/sections/ga4-section";
import { GscSection } from "@/components/sections/gsc-section";
import { ClaritySection } from "@/components/sections/clarity-section";
import { CalendlySection } from "@/components/sections/calendly-section";
import { WebsiteSignalsSection } from "@/components/sections/website-signals-section";
import { describeFreshness, PanelSkeleton, type FreshnessState } from "@/components/ui";
import type { SiteSummary } from "@/lib/api-types";

type View = "signals" | "ga4" | "gsc" | "clarity" | "calendly";

const VIEWS: Array<{
  id: View;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "signals", label: "Overview", hint: "Snapshot", icon: LayoutDashboard },
  { id: "ga4", label: "Analytics", hint: "Google Analytics", icon: BarChart3 },
  { id: "gsc", label: "Search", hint: "Search Console", icon: Search },
  { id: "clarity", label: "Behavior", hint: "Microsoft Clarity", icon: MousePointerClick },
  { id: "calendly", label: "Conversions", hint: "Calendly", icon: CalendarDays },
];

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
  const [view, setView] = useState<View>("signals");

  const selectedSite = useMemo(() => {
    if (!sites?.length) return undefined;
    return sites.find((site) => site.slug === selectedSiteSlug) ?? sites[0];
  }, [sites, selectedSiteSlug]);

  useEffect(() => {
    if (selectedSite && selectedSite.slug !== selectedSiteSlug) {
      setSelectedSiteSlug(selectedSite.slug);
    }
  }, [selectedSite, selectedSiteSlug, setSelectedSiteSlug]);

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
              onChange={(event) => setSelectedSiteSlug(event.target.value)}
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
                onClick={() => setView(item.id)}
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
            <p className="text-xs text-[var(--nos-text-secondary)]">
              {reportScope} · {dateFilterLabel(range)} · stored data only
            </p>
          </div>

          <RangeControls />
        </header>

        <div className="mx-auto flex w-full max-w-[1600px] gap-2 overflow-x-auto px-6 pb-4 lg:hidden">
          {sites.length > 1 ? (
            <select
              value={selectedSite?.slug ?? ""}
              onChange={(event) => setSelectedSiteSlug(event.target.value)}
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
              onClick={() => setView(item.id)}
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
          {selectedSite && <PullAlert site={selectedSite} range={range} />}
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

      <RefreshButton />
    </div>
  );
}

function presetWindow(days: number): { start: string; end: string } {
  const end = latestCompleteDay();
  return {
    start: toDateString(addDays(new Date(`${end}T00:00:00Z`), -(days - 1))),
    end,
  };
}

function RangeControls() {
  const { rangeDays, allTime, customStart, customEnd, setRangeDays, setAllTime, setCustomRange } =
    useDashboardStore();
  const resolved = customStart && customEnd ? { start: customStart, end: customEnd } : presetWindow(rangeDays);
  const [draftStart, setDraftStart] = useState(resolved.start);
  const [draftEnd, setDraftEnd] = useState(resolved.end);
  const yesterday = latestCompleteDay();

  useEffect(() => {
    setDraftStart(resolved.start);
    setDraftEnd(resolved.end);
  }, [resolved.start, resolved.end]);

  const dirty = draftStart !== resolved.start || draftEnd !== resolved.end;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-white/5 p-1">
        {RANGE_PRESETS.map((preset) => {
          const active = !customStart && !allTime && rangeDays === preset;
          return (
            <button
              key={preset}
              onClick={() => setRangeDays(preset as RangePreset)}
              className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                active ? "font-bold text-white" : "text-[var(--nos-text-secondary)]"
              }`}
              style={active ? { background: "var(--vui-gradient-brand)" } : undefined}
            >
              {preset}d
            </button>
          );
        })}
        <button
          onClick={() => setAllTime()}
          className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
            allTime && !customStart ? "font-bold text-white" : "text-[var(--nos-text-secondary)]"
          }`}
          style={allTime && !customStart ? { background: "var(--vui-gradient-brand)" } : undefined}
        >
          All time
        </button>
      </div>
      <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/5 px-2 py-1">
        <input
          type="date"
          value={draftStart}
          max={yesterday}
          onChange={(event) => setDraftStart(event.target.value)}
          className="bg-transparent text-xs text-white outline-none [color-scheme:dark]"
          aria-label="Range start"
        />
        <span className="text-[10px] text-[var(--nos-text-muted)]">to</span>
        <input
          type="date"
          value={draftEnd}
          max={yesterday}
          onChange={(event) => setDraftEnd(event.target.value)}
          className="bg-transparent text-xs text-white outline-none [color-scheme:dark]"
          aria-label="Range end"
        />
        <button
          disabled={!dirty || !draftStart || !draftEnd}
          onClick={() => setCustomRange(draftStart, draftEnd)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
          style={dirty ? { background: "var(--vui-gradient-brand)" } : undefined}
        >
          Apply
        </button>
      </div>
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

function pullRows(site: SiteSummary, freshness: NonNullable<ReturnType<typeof useWebsiteSignals>["data"]>["freshness"]) {
  return PULL_ROWS.filter((row) => row.show(site)).map((row) => {
    const described = describeFreshness(row.source, freshness[row.source]);
    return { ...row, ...described };
  });
}

function FreshnessCard({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const { data } = useWebsiteSignals(site.id, range);
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
              style={row.state === "fresh" ? undefined : { color: "#ffd0d0" }}
            >
              {stateWord(row.state)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PullAlert({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const { data } = useWebsiteSignals(site.id, range);
  if (!data) return null;
  const problems = pullRows(site, data.freshness).filter((row) => row.state !== "fresh");
  if (problems.length === 0) return null;

  return (
    <div
      className="mb-5 rounded-2xl px-4 py-3 text-sm text-white"
      style={{ border: "1px solid var(--nos-negative)", background: "rgba(227,26,26,0.12)" }}
    >
      <p className="font-semibold">A scheduled pull failed or is overdue.</p>
      <ul className="mt-1 space-y-1 text-xs text-white/80">
        {problems.map((row) => (
          <li key={row.source}>
            {row.label}: {row.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function stateWord(state: FreshnessState): string {
  if (state === "failing") return "Failed";
  if (state === "stale") return "Overdue";
  if (state === "never") return "Never";
  return "Fresh";
}

function RefreshButton() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "syncing" | "error">("idle");

  return (
    <button
      aria-label="Sync data sources"
      title="Pull fresh data from GA4, Search Console, Clarity and Calendly"
      disabled={state === "syncing"}
      onClick={async () => {
        setState("syncing");
        try {
          const response = await fetch("/api/sync", { method: "POST" });
          if (!response.ok) throw new Error(String(response.status));
          await queryClient.invalidateQueries();
          setState("idle");
        } catch {
          setState("error");
          setTimeout(() => setState("idle"), 4000);
        }
      }}
      className="fixed bottom-6 right-6 z-30 flex size-12 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90 disabled:opacity-70"
      style={{
        background:
          state === "error" ? "var(--nos-negative)" : "var(--vui-gradient-brand)",
        boxShadow: "var(--vui-shadow-blue)",
      }}
    >
      <RefreshCw size={18} className={state === "syncing" ? "animate-spin" : undefined} />
    </button>
  );
}

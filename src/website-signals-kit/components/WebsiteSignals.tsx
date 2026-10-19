"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionTLDR } from "./SectionTLDR";
import { KPICard } from "./KPICard";
import { DashboardCard } from "./DashboardCard";
import { TrendLine } from "./charts/TrendLine";
import { DonutChart } from "./charts/DonutChart";
import { SeoTrafficGlobe } from "./charts/SeoTrafficGlobe";
import { Badge } from "./Badge";
import {
  ChevronDown,
  ExternalLink,
  Play,
  MousePointer,
  MousePointerClick,
  MoveVertical,
  ArrowLeft,
  Bug,
  Monitor,
  Smartphone,
  Tablet,
  Users,
} from "lucide-react";
import type { CompanySignal, CountryRow, SessionRecording, WebsiteData } from "../lib/types";
import { formatCompact } from "../lib/utils";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const fmtNum = formatCompact;

const intentBadge = (intent: NonNullable<CompanySignal["intent"]>) => {
  const map = {
    hot: { label: "Hot", color: "var(--nos-signal-hot)" },
    warm: { label: "Warm", color: "var(--nos-signal-warm)" },
    cold: { label: "Cold", color: "var(--nos-signal-cold)" },
  };
  const cfg = map[intent];
  return (
    <Badge
      className="text-[9px]"
      style={{ background: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </Badge>
  );
};

const flagColors: Record<
  SessionRecording["flags"][number],
  { label: string; color: string; icon: React.ReactNode }
> = {
  "rage-click": { label: "Rage Click", color: "var(--nos-negative)", icon: <MousePointerClick size={9} /> },
  "dead-click": { label: "Dead Click", color: "var(--nos-signal-warm)", icon: <MousePointerClick size={9} /> },
  "quick-back": { label: "Quick-Back", color: "#7551FF", icon: <ArrowLeft size={9} /> },
  "js-error": { label: "JS Error", color: "#E31A1A", icon: <Bug size={9} /> },
};

const deviceIcon = (d: SessionRecording["device"]) => {
  if (d === "mobile") return <Smartphone size={12} />;
  if (d === "tablet") return <Tablet size={12} />;
  return <Monitor size={12} />;
};

/**
 * Gradient spotlight card, the shape Vision UI uses for its "Welcome back" and
 * "Earnings" panels. Populated from the top country we already have, so the
 * bento gains that visual variety without inventing a metric.
 */
function TopMarketCard({
  countries,
  countrySessions,
  coverageNote,
}: {
  countries: CountryRow[];
  countrySessions: number;
  coverageNote?: string;
}) {
  const top = countries[0];
  if (!top) return null;

  const shareBase = countrySessions > 0 ? countrySessions : countries.reduce((sum, country) => sum + country.traffic, 0);
  const share = shareBase > 0 ? Math.round((top.traffic / shareBase) * 100) : 0;
  const growing = (top.trafficChange ?? 0) >= 0;

  return (
    <div
      className="relative shrink-0 overflow-hidden p-5"
      style={{
        background: "var(--vui-gradient-purple)",
        borderRadius: "var(--vui-radius-card)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full"
        style={{ background: "rgba(255,255,255,0.12)" }}
      />
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/70">
        Top market
      </p>
      <p className="mt-2 flex items-center gap-2 text-xl font-bold text-white">
        <span className="text-2xl leading-none">{top.flag}</span>
        {top.name}
      </p>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none text-white">{fmtNum(top.traffic)}</span>
        <span className="text-xs text-white/70">sessions</span>
      </p>
      <p className="mt-2 text-xs text-white/80">
        {share}% of sessions with a country
        {top.trafficChange !== null && (
          <>
            {" "}
            ·{" "}
            <span className="font-bold text-white">
              {growing ? "+" : ""}
              {top.trafficChange}%
            </span>{" "}
            vs previous period
          </>
        )}
      </p>
      {coverageNote && <p className="mt-2 text-[11px] leading-snug text-white/70">{coverageNote}</p>}
    </div>
  );
}

function FunnelChart({ steps }: { steps: { label: string; sessions: number; dropoffPct: number }[] }) {
  const maxSessions = steps[0]?.sessions ?? 1;
  return (
    <div className="mt-2 flex flex-col gap-3">
      {steps.map((step, i) => {
        const widthPct = (step.sessions / maxSessions) * 100;
        const isFirst = i === 0;
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium" style={{ color: "var(--nos-text-secondary)" }}>
                {step.label}
              </span>
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-bold"
                  style={{ fontFamily: "var(--font-geist-mono)", color: "var(--nos-text-primary)" }}
                >
                  {fmtNum(step.sessions)}
                </span>
                {!isFirst && (
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: "rgba(227,26,26,0.15)", color: "var(--nos-negative)" }}
                  >
                    -{step.dropoffPct}%
                  </span>
                )}
              </div>
            </div>
            <div
              className="h-8 overflow-hidden rounded-xl"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-xl"
                style={{
                  background: isFirst
                    ? "var(--vui-gradient-brand)"
                    : `linear-gradient(310deg, rgba(0,117,255,${0.9 - i * 0.12}) 0%, rgba(33,212,253,${0.85 - i * 0.1}) 100%)`,
                  boxShadow: isFirst ? "var(--vui-shadow-blue)" : "none",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecordingRow({ rec }: { rec: SessionRecording }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 py-2.5 border-b last:border-0 group cursor-pointer transition-colors"
      style={{ borderColor: "var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--nos-bg-elevated)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 group-hover:opacity-100 opacity-60 transition-opacity"
        style={{ background: "var(--nos-accent-muted)", border: "1px solid var(--nos-accent-border)" }}
      >
        <Play size={10} style={{ color: "var(--nos-accent)" }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--nos-text-primary)" }}>
          {rec.page}
        </p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {rec.flags.map((f) => {
            const cfg = flagColors[f];
            return (
              <span
                key={f}
                className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}30` }}
              >
                {cfg.icon}
                {cfg.label}
              </span>
            );
          })}
          {rec.flags.length === 0 && (
            <span className="text-[9px]" style={{ color: "var(--nos-text-muted)" }}>
              No issues
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span
          className="text-xs font-bold"
          style={{ fontFamily: "var(--font-geist-mono)", color: "var(--nos-text-secondary)" }}
        >
          {rec.duration}
        </span>
        <span className="text-[10px]" style={{ color: "var(--nos-text-muted)" }}>
          {rec.country}
        </span>
        <span style={{ color: "var(--nos-text-muted)" }}>{deviceIcon(rec.device)}</span>
      </div>
    </motion.div>
  );
}

/**
 * Column set for the company feed. Every entry past "Company" is optional, and
 * a column only renders when at least one row can supply it — so a backend
 * that has no lead scoring simply shows a narrower table rather than a column
 * of dashes.
 */
type SignalColumn = {
  header: string;
  available: (signal: CompanySignal) => boolean;
  cell: (signal: CompanySignal) => React.ReactNode;
};

const SIGNAL_COLUMNS: SignalColumn[] = [
  {
    header: "Title",
    available: (s) => s.title !== undefined,
    cell: (s) => (
      <span className="text-xs" style={{ color: "var(--nos-text-secondary)" }}>{s.title}</span>
    ),
  },
  {
    header: "Industry",
    available: (s) => s.industry !== undefined,
    cell: (s) => (
      <span className="text-xs" style={{ color: "var(--nos-text-muted)" }}>{s.industry}</span>
    ),
  },
  {
    header: "Signal Score",
    available: (s) => s.signalScore !== undefined,
    cell: (s) => (
      <span
        className="text-sm font-bold"
        style={{ color: "var(--nos-accent)", fontFamily: "var(--font-geist-mono)" }}
      >
        {s.signalScore}
      </span>
    ),
  },
  {
    header: "Pages",
    available: () => true,
    cell: (s) => (
      <span className="text-xs" style={{ color: "var(--nos-text-secondary)" }}>
        {s.pagesVisited}
      </span>
    ),
  },
  {
    header: "Time on Site",
    available: (s) => s.timeOnSite !== undefined,
    cell: (s) => (
      <span className="text-xs" style={{ color: "var(--nos-text-secondary)" }}>{s.timeOnSite}</span>
    ),
  },
  {
    header: "Source",
    available: () => true,
    cell: (s) => (
      <span className="text-xs" style={{ color: "var(--nos-text-secondary)" }}>{s.source}</span>
    ),
  },
  {
    header: "Last Seen",
    available: (s) => s.lastSeen !== undefined,
    cell: (s) => (
      <span className="text-xs" style={{ color: "var(--nos-text-muted)" }}>{s.lastSeen}</span>
    ),
  },
  {
    header: "Intent",
    available: (s) => s.intent !== undefined,
    cell: (s) => (s.intent ? intentBadge(s.intent) : null),
  },
];

function visibleSignalColumns(signals: CompanySignal[]): SignalColumn[] {
  return SIGNAL_COLUMNS.filter((column) => signals.some((signal) => column.available(signal)));
}

function SignalRow({
  signal,
  columns,
  expanded,
  onToggle,
}: {
  signal: CompanySignal;
  columns: SignalColumn[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-white/5"
        onClick={onToggle}
      >
        <td className="py-3 pr-4 font-bold" style={{ color: "var(--nos-text-primary)" }}>
          {signal.company}
        </td>
        {columns.map((column) => (
          <td key={column.header} className="py-3 pr-4">
            {column.cell(signal)}
          </td>
        ))}
        <td className="py-3">
          <ChevronDown
            size={14}
            className="transition-transform"
            style={{
              color: "var(--nos-text-muted)",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={columns.length + 2}>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div
                  className="flex items-start gap-8 rounded-xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <div>
                    <p className="text-[10px] text-label-caps mb-1">Pages Visited</p>
                    <div className="flex flex-wrap gap-1">
                      {signal.pages.map((page) => (
                        <span
                          key={page}
                          className="rounded-md px-2 py-0.5 text-xs"
                          style={{
                            color: "var(--nos-accent-2)",
                            background: "var(--nos-accent-muted)",
                          }}
                        >
                          {page}
                        </span>
                      ))}
                    </div>
                  </div>
                  {signal.companySize !== undefined && (
                    <div>
                      <p className="text-[10px] text-label-caps mb-1">Company Size</p>
                      <p className="text-sm" style={{ color: "var(--nos-text-primary)" }}>
                        {signal.companySize} employees
                      </p>
                    </div>
                  )}
                  {signal.linkedinUrl && (
                    <a
                      href={signal.linkedinUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1 text-xs mt-4 hover:underline"
                      style={{ color: "var(--nos-accent)" }}
                    >
                      <ExternalLink size={11} /> View on LinkedIn
                    </a>
                  )}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

export interface WebsiteSignalsProps {
  data: WebsiteData;
}

/** Full Website Signals section — Clarity KPIs, globe, recordings, company feed. */
export function WebsiteSignals({ data }: WebsiteSignalsProps) {
  const website = data;

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [intentFilter, setIntentFilter] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const highlightedCountry = hoveredCountry ?? activeCountry;

  const signalColumns = visibleSignalColumns(website.signals);
  // The intent filter is only meaningful when the backend supplies intent.
  const hasIntent = website.signals.some((s) => s.intent !== undefined);
  const filteredSignals =
    !hasIntent || intentFilter === "all"
      ? website.signals
      : website.signals.filter((s) => s.intent === intentFilter);

  const recordings = website.sessionRecordings;
  const readingBehavior = website.readingBehavior;

  /** Behavioral KPIs can have a different scope than the rest of the view. */
  const behaviorTip = (base: string) =>
    website.behaviorScopeNote ? `${base} ${website.behaviorScopeNote}` : base;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      {website.tldr && <SectionTLDR tldr={website.tldr} />}

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 gap-5 md:grid-cols-3"
      >
        <KPICard
          label="Sessions"
          value={website.sessions.value}
          change={website.sessions.change}
          sparkline={website.sessions.sparkline}
          tooltip={
            website.sessionsNote
              ? `Total sessions recorded in this period. ${website.sessionsNote}`
              : "Total sessions recorded in this period."
          }
          icon={Users}
        />
        {website.rageclickRate && (
          <KPICard
            label="Rage Clicks"
            value={website.rageclickRate.value}
            change={website.rageclickRate.change}
            sparkline={website.rageclickRate.sparkline}
            suffix="%"
            invertChange
            tooltip={behaviorTip(
              "Rage click: the visitor hammered the same spot three or more times. Usually a control that looks clickable but does nothing.",
            )}
            icon={MousePointerClick}
          />
        )}
        {website.deadclickRate && (
          <KPICard
            label="Dead Clicks"
            value={website.deadclickRate.value}
            change={website.deadclickRate.change}
            sparkline={website.deadclickRate.sparkline}
            suffix="%"
            invertChange
            tooltip={behaviorTip(
              "Dead click: a click on something that has no action — decorative text, a non-interactive image, or a disabled control.",
            )}
            icon={MousePointer}
          />
        )}
        {website.quickBackRate && (
          <KPICard
            label="Quick-Backs"
            value={website.quickBackRate.value}
            change={website.quickBackRate.change}
            sparkline={website.quickBackRate.sparkline}
            suffix="%"
            invertChange
            tooltip={behaviorTip(
              "Quick back: the visitor left within a few seconds. They did not find what the landing promised.",
            )}
            icon={ArrowLeft}
          />
        )}
        {website.scrollDepth && (
          <KPICard
            label="Scroll Depth"
            value={website.scrollDepth.value}
            change={website.scrollDepth.change}
            sparkline={website.scrollDepth.sparkline}
            suffix="%"
            tooltip={behaviorTip("Average percentage of page height scrolled per session.")}
            icon={MoveVertical}
          />
        )}
        {website.jsErrors && (
          <KPICard
            label="JS Errors"
            value={website.jsErrors.value}
            change={website.jsErrors.change}
            sparkline={website.jsErrors.sparkline}
            suffix={website.jsErrors.suffix}
            invertChange
            tooltip={behaviorTip(
              "JavaScript error: a script exception ran during the session. High rates usually mean a broken form or widget.",
            )}
            icon={Bug}
          />
        )}
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-5"
      >
        <div className="nos-card flex flex-col lg:col-span-3">
          <TrendLine
            data={website.visitorTrend}
            title="Session Trend"
            subtitle="Weekly sessions"
            color="#21d4fd"
            height={220}
            xAxisLabel="Week"
            yAxisLabel="Sessions"
          />
        </div>

        <div className="flex flex-col gap-5 lg:col-span-2">
          <TopMarketCard
            countries={website.visitorCountries}
            countrySessions={website.countrySessions}
            coverageNote={website.marketsCoverageNote}
          />

          {readingBehavior && (
          <DashboardCard
            title="Reading Behavior"
            subtitle="Session engagement depth"
            info="Clarity engagement classification — Casual (< 1 min), Serious (1–3 min), Reader (> 3 min)."
          >
            <div className="mt-3 space-y-3">
              {readingBehavior.map((b) => (
                <div key={b.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: "var(--nos-text-secondary)" }}>
                      {b.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: "var(--nos-text-muted)" }}>
                        {fmtNum(b.sessions)} sessions
                      </span>
                      <span className="text-xs font-bold" style={{ color: b.color }}>
                        {b.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--nos-bg-elevated)" }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${b.pct}%` }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-full"
                      style={{ background: b.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>
          )}

          <div className="nos-card flex flex-1 flex-col justify-center">
            <DonutChart
              data={website.trafficSources}
              title="Traffic Sources"
              subtitle={website.sourcesCoverageNote ?? "Session origin breakdown"}
              height={180}
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-5"
      >
        <DashboardCard
          title="Visitor Geography"
          subtitle="Session traffic by country — drag to rotate"
          info="Drag the globe, hover a dot to inspect country-level session data."
          className="lg:col-span-3"
          bodyClassName="flex items-center justify-center"
        >
          <SeoTrafficGlobe
            countries={website.visitorCountries}
            activeCode={activeCountry}
            onCountryHover={setHoveredCountry}
            onCountrySelect={setActiveCountry}
          />
        </DashboardCard>

        <DashboardCard
          title="Top Pages"
          subtitle={
            website.pagesCoverageNote ??
            (website.topPages.some((p) => p.scrollDepth !== undefined)
              ? "Sessions · Scroll depth · Exit rate"
              : "Ranked by sessions")
          }
          info="Highest-traffic pages ranked by sessions."
          className="lg:col-span-2"
          bodyClassName="flex flex-col"
        >
          <div className="space-y-0">
            {website.topPages.map((page, i) => (
              <motion.div
                key={page.url}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="border-b py-2.5 last:border-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span
                    className="min-w-0 flex-1 truncate text-xs font-medium"
                    style={{ color: "var(--nos-accent-2)" }}
                  >
                    {page.url}
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ fontFamily: "var(--font-geist-mono)", color: "var(--nos-text-primary)" }}
                  >
                    {fmtNum(page.sessions)}
                  </span>
                </div>
                {(page.scrollDepth !== undefined || page.exitRate !== undefined) && (
                  <div className="flex items-center gap-3">
                    {page.scrollDepth !== undefined && (
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px]" style={{ color: "var(--nos-text-muted)" }}>
                            Scroll
                          </span>
                          <span
                            className="text-[9px] font-semibold"
                            style={{ color: "var(--nos-positive)" }}
                          >
                            {page.scrollDepth}%
                          </span>
                        </div>
                        <div
                          className="h-1 rounded-full overflow-hidden"
                          style={{ background: "var(--nos-bg-elevated)" }}
                        >
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${page.scrollDepth}%` }}
                            transition={{ duration: 0.7, delay: 0.1 + i * 0.04 }}
                            className="h-full rounded-full"
                            style={{ background: "var(--nos-positive)" }}
                          />
                        </div>
                      </div>
                    )}
                    {page.exitRate !== undefined && (
                      <div className="text-right shrink-0">
                        <span className="text-[9px]" style={{ color: "var(--nos-text-muted)" }}>
                          Exit{" "}
                        </span>
                        <span
                          className="text-[9px] font-bold"
                          style={{
                            color:
                              page.exitRate > 40
                                ? "var(--nos-negative)"
                                : "var(--nos-text-secondary)",
                          }}
                        >
                          {page.exitRate}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Pinned to the bottom so this block lines up with the base of the
              globe card beside it. */}
          <div className="mt-auto border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-label-caps mb-2">Sessions by Country</p>
            <div className="space-y-1">
              {website.visitorCountries.slice(0, 4).map((c) => {
                const isGrowing = c.trafficChange !== null && c.trafficChange >= 0;
                const maxT = Math.max(...website.visitorCountries.map((x) => x.traffic));
                const isHighlighted = highlightedCountry === c.code;
                return (
                  <div
                    key={c.code}
                    className="flex items-center gap-2 cursor-pointer rounded-md px-1 py-0.5 transition-colors"
                    style={{ background: isHighlighted ? "var(--nos-accent-muted)" : "transparent" }}
                    onMouseEnter={() => setHoveredCountry(c.code)}
                    onMouseLeave={() => setHoveredCountry(null)}
                    onClick={() => setActiveCountry(activeCountry === c.code ? null : c.code)}
                  >
                    <span className="text-sm">{c.flag}</span>
                    <span className="text-xs flex-1" style={{ color: "var(--nos-text-secondary)" }}>
                      {c.name}
                    </span>
                    <div
                      className="h-1 w-16 overflow-hidden rounded-full"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(c.traffic / maxT) * 100}%` }}
                        transition={{ duration: 0.7 }}
                        className="h-full rounded-full"
                        style={{ background: "var(--vui-gradient-brand)" }}
                      />
                    </div>
                    <span
                      className="w-8 text-right text-[10px] font-bold"
                      style={{
                        color:
                          c.trafficChange === null
                            ? "transparent"
                            : isGrowing
                              ? "var(--nos-positive)"
                              : "var(--nos-negative)",
                      }}
                    >
                      {c.trafficChange === null
                        ? ""
                        : `${isGrowing ? "+" : ""}${c.trafficChange}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </DashboardCard>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className={`grid grid-cols-1 items-stretch gap-5 ${recordings ? "lg:grid-cols-3" : ""}`}
      >
        {recordings && (
          <DashboardCard
            title="Session Recordings"
            subtitle="Latest recorded sessions with behavior flags"
            info="Rage clicks, dead clicks, quick-backs, and JS errors are auto-detected."
            className="lg:col-span-2"
          >
            <div>
              <div
                className="mb-3 flex flex-wrap items-center gap-3 border-b pb-2"
                style={{ borderColor: "var(--border)" }}
              >
                {(["rage-click", "dead-click", "quick-back", "js-error"] as const).map((f) => {
                  const cfg = flagColors[f];
                  return (
                    <div
                      key={f}
                      className="flex items-center gap-1 text-[10px] font-semibold"
                      style={{ color: cfg.color }}
                    >
                      {cfg.icon}
                      <span>{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
              {recordings.map((rec) => (
                <RecordingRow key={rec.id} rec={rec} />
              ))}
            </div>
          </DashboardCard>
        )}

        <DashboardCard
          title="Conversion Funnel"
          subtitle="Drop-off analysis"
          info="Session funnel from homepage to conversion."
          bodyClassName="flex flex-col justify-center"
        >
          <FunnelChart steps={website.funnelSteps} />
        </DashboardCard>
      </motion.div>

      {website.signals.length > 0 && (
      <motion.div variants={itemVariants} className="nos-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-base font-bold" style={{ color: "var(--nos-text-primary)" }}>
              Identified Company Signal Feed
            </p>
            <p className="text-xs" style={{ color: "var(--nos-text-muted)" }}>
              {hasIntent
                ? "Companies identified by IP resolution — sorted by intent signal score"
                : "Companies identified by IP resolution — sorted by pages visited"}
            </p>
          </div>
          <div className="flex gap-1">
            {hasIntent &&
              (["all", "hot", "warm", "cold"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setIntentFilter(f)}
                className="text-xs px-3 py-1 rounded-full transition-colors capitalize"
                style={{
                  background:
                    intentFilter === f ? "var(--vui-gradient-brand)" : "rgba(255,255,255,0.06)",
                  color: intentFilter === f ? "white" : "var(--nos-text-muted)",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="sticky top-0" style={{ background: "#0a0f2c" }}>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Company", ...signalColumns.map((c) => c.header), ""].map((h, i) => (
                    <th key={`${h}-${i}`} className="text-label-caps pb-3 pr-4 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSignals.map((signal) => (
                  <SignalRow
                    key={signal.id}
                    signal={signal}
                    columns={signalColumns}
                    expanded={expandedRow === signal.id}
                    onToggle={() => setExpandedRow(expandedRow === signal.id ? null : signal.id)}
                  />
                ))}
              </tbody>
            </table>
            {filteredSignals.length === 0 && (
              <p className="py-6 text-center text-xs" style={{ color: "var(--nos-text-muted)" }}>
                No identified companies in this range.
              </p>
            )}
          </div>
        </div>
      </motion.div>
      )}
    </motion.div>
  );
}

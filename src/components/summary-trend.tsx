"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { InfoEye, formatNumber } from "@/components/ui";
import type { SummaryInsight, SummaryResponse } from "@/lib/api-types";

type Metric = "sessions" | "clicks";

const METRICS: Record<Metric, { label: string; info: string }> = {
  sessions: { label: "Website visits", info: "Daily Google Analytics sessions." },
  clicks: { label: "Search clicks", info: "Daily clicks from Google Search results." },
};

const CURRENT = "#21d4fd";
const PREVIOUS = "rgba(255,255,255,0.45)";

export function SummaryTrend({ data }: { data: SummaryResponse }) {
  const [metric, setMetric] = useState<Metric>("sessions");
  const points = data.daily.map((day) => ({
    date: day.current.date.slice(5),
    current: day.current[metric],
    previous: day.previous ? day.previous[metric] : null,
  }));
  const hasData = points.some((point) => point.current !== null);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-white">
          Day by day
          <InfoEye
            text={[
              `${METRICS[metric].info} The solid line is this range.`,
              data.previous
                ? "The dashed line is the same day in the previous period, so each point compares like with like."
                : "All time has no previous period to draw.",
              "A gap means no stored data for that day, not zero.",
            ]}
          />
        </p>
        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-[11px]">
          {(Object.keys(METRICS) as Metric[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                metric === key ? "bg-white/10 text-white" : "text-[var(--nos-text-muted)] hover:text-white"
              }`}
            >
              {METRICS[key].label}
            </button>
          ))}
        </div>
      </div>
      {hasData ? (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: "#0f1535",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value) => (typeof value === "number" ? formatNumber(value) : "No data")}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.previous && (
                <Line
                  name="Previous period"
                  type="monotone"
                  dataKey="previous"
                  stroke={PREVIOUS}
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                name="This range"
                type="monotone"
                dataKey="current"
                stroke={CURRENT}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, fill: CURRENT, stroke: "#0f1535", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-[var(--nos-text-muted)]">
          No stored {METRICS[metric].label.toLowerCase()} in this range.
        </p>
      )}
    </div>
  );
}

const TONE_COLOR: Record<SummaryInsight["tone"], string> = {
  good: "var(--nos-positive)",
  bad: "var(--nos-negative)",
  neutral: "var(--nos-text-muted)",
};

export function InsightsCard({ insights }: { insights: SummaryInsight[] }) {
  return (
    <div className="rounded-2xl border border-[var(--nos-accent-border)] bg-[var(--nos-bg-overlay)] p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-white">
        Insights
        <InfoEye
          text={[
            "Findings written from the stored figures for the selected range, ranked by importance.",
            "Green is good news, red needs a look, grey is context. They update when you change the dates.",
          ]}
        />
      </p>
      <ul className="space-y-2.5">
        {insights.map((insight) => (
          <li key={insight.text} className="flex gap-2.5 text-xs leading-relaxed text-[var(--nos-text-secondary)]">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: TONE_COLOR[insight.tone] }}
            />
            {insight.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

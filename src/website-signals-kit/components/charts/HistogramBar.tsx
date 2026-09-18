"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CustomTooltip } from "./CustomTooltip";

const SERIES = [
  { dataKey: "sessions", name: "Sessions", fill: "#0075ff" },
  { dataKey: "users", name: "Users", fill: "#21d4fd" },
  { dataKey: "newUsers", name: "New users", fill: "#01b574" },
] as const;

export function HistogramBar({
  data,
  title,
  subtitle,
  height = 240,
  names,
}: {
  data: Array<{ date: string; sessions: number; users?: number; newUsers?: number }>;
  title: string;
  subtitle?: string;
  height?: number;
  names?: { sessions?: string; users?: string; newUsers?: string };
}) {
  const showUsers = data.some((row) => typeof row.users === "number");
  const showNew = data.some((row) => typeof row.newUsers === "number");
  const bars = SERIES.filter((bar) => {
    if (bar.dataKey === "users") return showUsers;
    if (bar.dataKey === "newUsers") return showNew;
    return true;
  }).map((bar) => ({
    ...bar,
    name: names?.[bar.dataKey] ?? bar.name,
  }));

  return (
    <div>
      <p className="text-base font-bold text-[var(--nos-text-primary)]">{title}</p>
      {subtitle && (
        <p className="mb-2 mt-0.5 text-xs text-[var(--nos-text-secondary)]">{subtitle}</p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
            tickFormatter={(value) => String(value).slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          {(showUsers || showNew) && (
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11, color: "var(--nos-text-secondary)" }}
            />
          )}
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name}
              fill={bar.fill}
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

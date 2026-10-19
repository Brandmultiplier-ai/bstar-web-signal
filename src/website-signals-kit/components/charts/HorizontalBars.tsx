"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CustomTooltip } from "./CustomTooltip";

function shortLabel(name: string): string {
  if (name === "/" || name === "(not set)") return name === "(not set)" ? "Unknown" : "/";
  const trimmed = name.replace(/\/$/, "");
  const parts = trimmed.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? name;
  return last.length > 22 ? `…${last.slice(-21)}` : `/${last}`;
}

export function HorizontalBars({
  data,
  title,
  subtitle,
  height = 280,
  color = "#0075ff",
}: {
  data: Array<{ name: string; value: number }>;
  title: string;
  subtitle?: string;
  height?: number;
  color?: string;
}) {
  const shortened = data
    .filter((row) => row.name !== "(not set)" && row.value > 0)
    .slice(0, 8)
    .map((row) => shortLabel(row.name));
  const seen = new Map<string, number>();
  const rows = data
    .filter((row) => row.name !== "(not set)" && row.value > 0)
    .slice(0, 8)
    .map((row, index) => {
      const base = shortened[index] ?? shortLabel(row.name);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return { ...row, label: count === 1 ? base : `${base} · ${count}` };
    });

  if (rows.length === 0) return null;

  return (
    <div>
      <p className="text-base font-bold text-[var(--nos-text-primary)]">{title}</p>
      {subtitle && (
        <p className="mb-2 mt-0.5 text-xs text-[var(--nos-text-secondary)]">{subtitle}</p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.1)" horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={148}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--nos-text-secondary)", fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" name="Sessions" fill={color} radius={[0, 6, 6, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

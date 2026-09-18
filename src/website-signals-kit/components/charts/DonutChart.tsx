"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useState, useEffect } from "react";
import { CustomTooltip } from "./CustomTooltip";

/** Vision UI series order: blue, cyan, purple, green, amber, red. */
const CHART_COLORS = [
  "#0075ff",
  "#21d4fd",
  "#7551ff",
  "#01b574",
  "#ffb547",
  "#e31a1a",
  "#582cff",
  "#35efa1",
];

interface DonutChartProps {
  data: { name: string; value: number }[];
  title: string;
  subtitle?: string;
  height?: number;
}

export function DonutChart({ data, title, subtitle, height = 240 }: DonutChartProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  const slices = data.filter((row) => row.value > 0).slice(0, 8);

  if (slices.length === 0) return null;

  if (!ready) {
    return (
      <div
        className="rounded-lg animate-pulse"
        style={{ height, background: "var(--nos-bg-elevated)" }}
      />
    );
  }

  return (
    <div>
      <p className="text-base font-bold text-[var(--nos-text-primary)]">{title}</p>
      {subtitle && (
        <p className="mb-2 mt-0.5 text-xs text-[var(--nos-text-secondary)]">{subtitle}</p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={slices}
            cx="50%"
            cy="46%"
            innerRadius={height * 0.26}
            outerRadius={height * 0.38}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
            stroke="none"
            animationBegin={300}
            animationDuration={900}
          >
            {slices.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{
              fontSize: 11,
              color: "var(--nos-text-secondary)",
              paddingTop: 8,
            }}
            formatter={(value) => {
              const label = String(value);
              return label.length > 22 ? `${label.slice(0, 20)}…` : label;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

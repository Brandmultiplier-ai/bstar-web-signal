"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { memo } from "react";
import { CustomTooltip } from "./CustomTooltip";

interface TrendLineProps {
  data: { date: string; value: number }[];
  title: string;
  subtitle?: string;
  color?: string;
  prefix?: string;
  height?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

/**
 * Vision UI renders its trend as a cyan area fading into the card, with a
 * dashed horizontal grid and no axis lines.
 */
export const TrendLine = memo(function TrendLine({
  data,
  title,
  subtitle,
  color = "#21d4fd",
  prefix = "",
  height = 200,
}: TrendLineProps) {
  const chartKey = data.length
    ? `${data[0].date}-${data[data.length - 1].date}-${data[data.length - 1].value}-${data.length}`
    : "empty";

  return (
    <div>
      <p className="text-base font-bold text-[var(--nos-text-primary)]">{title}</p>
      {subtitle && (
        <p className="mb-3 mt-0.5 text-xs text-[var(--nos-text-secondary)]">{subtitle}</p>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer key={chartKey} width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="vuiTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="rgba(255,255,255,0.1)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
              tickFormatter={(v) => String(v).slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
            />
            <Tooltip
              content={<CustomTooltip prefix={prefix} />}
              cursor={{ stroke: "rgba(255,255,255,0.2)", strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={3}
              fill="url(#vuiTrendFill)"
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: "#0f1535", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

"use client";

import { memo } from "react";
import { Activity } from "lucide-react";
import { CardInfoButton } from "./CardInfoButton";
import { MiniSparkline } from "./MiniSparkline";
import { formatCompact } from "../lib/utils";

interface KPICardProps {
  label: string;
  value: number;
  change: number | null;
  sparkline: number[];
  prefix?: string;
  suffix?: string;
  tooltip: string;
  className?: string;
  invertChange?: boolean;
  /**
   * Metric glyph for the gradient tile. Vision UI keeps the tile a single
   * brand gradient across the whole statistics row and differentiates cards by
   * icon, not by color.
   */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

function formatNumber(n: number, prefix = "", suffix = ""): string {
  if (n >= 1_000) return `${prefix}${formatCompact(n)}${suffix}`;
  if (Number.isInteger(n)) return `${prefix}${n.toLocaleString()}${suffix}`;
  return `${prefix}${n.toFixed(1)}${suffix}`;
}

export const KPICard = memo(function KPICard({
  label,
  value,
  change,
  sparkline,
  prefix = "",
  suffix = "",
  tooltip,
  className = "",
  invertChange = false,
  icon: Icon = Activity,
}: KPICardProps) {
  const isPositive = (change ?? 0) > 0;
  const isNeutral = change === null || change === 0;
  const isGood = invertChange ? (change ?? 0) < 0 : (change ?? 0) > 0;

  const deltaColor = isNeutral
    ? "var(--nos-text-muted)"
    : isGood
      ? "var(--nos-positive)"
      : "var(--nos-negative)";

  const orientedSparkline = (() => {
    if (!sparkline || sparkline.length < 2 || isNeutral) return sparkline;
    const trendsUp = sparkline[sparkline.length - 1] >= sparkline[0];
    if ((isPositive && !trendsUp) || (!isPositive && trendsUp)) {
      return [...sparkline].reverse();
    }
    return sparkline;
  })();

  return (
    <div className={`nos-card group cursor-default select-none ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-1.5">
            <span className="text-label-caps whitespace-normal leading-snug">{label}</span>
            <CardInfoButton description={tooltip} />
          </div>

          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono-metric">{formatNumber(value, prefix, suffix)}</span>
            {change !== null && (
              <span className="text-sm font-bold" style={{ color: deltaColor }}>
                {change >= 0 ? "+" : ""}
                {change}%
              </span>
            )}
          </p>
        </div>

        <span
          className="vui-tile"
          style={{ background: "var(--vui-gradient-brand)", width: 45, height: 45 }}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
      </div>

      <div className="mt-3">
        <MiniSparkline data={orientedSparkline} color="var(--nos-accent-2)" width={96} />
      </div>
    </div>
  );
});

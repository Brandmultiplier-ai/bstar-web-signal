"use client";

import { memo, useMemo } from "react";

interface MiniSparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

export const MiniSparkline = memo(function MiniSparkline({
  data,
  color,
  width = 72,
  height = 28,
}: MiniSparklineProps) {
  const { line, area, gradId } = useMemo(() => {
    const id = `spark-${Math.abs(color.split("").reduce((a, c) => a + c.charCodeAt(0), 0))}`;
    if (!data.length) return { line: "", area: "", gradId: id };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 2;
    const innerH = height - pad * 2;

    const coords = data.map((v, i) => {
      const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return [x, y] as [number, number];
    });

    const linePath = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaPath = `M0,${height} L${first[0].toFixed(1)},${first[1].toFixed(1)} ${coords
      .slice(1)
      .map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ")} L${last[0].toFixed(1)},${height} Z`;

    return { line: linePath, area: areaPath, gradId: id };
  }, [data, width, height, color]);

  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.55} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        {/* Vision UI fades its sparklines left-to-right into the card. */}
        <linearGradient id={`${gradId}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--nos-accent)" />
          <stop offset="100%" stopColor="var(--nos-accent-2)" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gradId})`} />}
      {line && (
        <polyline
          points={line}
          fill="none"
          stroke={`url(#${gradId}-stroke)`}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
});

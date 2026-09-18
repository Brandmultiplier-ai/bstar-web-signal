interface ChartAxisLabelsProps {
  xLabel: string;
  yLabel: string;
  className?: string;
}

export function ChartAxisLabels({ xLabel, yLabel, className = "" }: ChartAxisLabelsProps) {
  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}
      aria-label={`Chart axes: horizontal ${xLabel}, vertical ${yLabel}`}
    >
      <span className="text-[10px] text-[var(--nos-text-muted)]">
        <span className="font-semibold text-[var(--nos-text-secondary)]">X</span> {xLabel}
      </span>
      <span className="text-[10px] text-[var(--nos-text-muted)]">
        <span className="font-semibold text-[var(--nos-text-secondary)]">Y</span> {yLabel}
      </span>
    </div>
  );
}

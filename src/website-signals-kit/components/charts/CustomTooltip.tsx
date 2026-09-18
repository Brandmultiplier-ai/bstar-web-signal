"use client";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
    payload?: { name?: string };
  }>;
  label?: string;
  prefix?: string;
  suffix?: string;
}

function fmt(v: number, prefix = "", suffix = "") {
  if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M${suffix}`;
  if (v >= 1_000) return `${prefix}${(v / 1_000).toFixed(0)}k${suffix}`;
  return `${prefix}${v.toLocaleString()}${suffix}`;
}

export function CustomTooltip({
  active,
  payload,
  label,
  prefix = "",
  suffix = "",
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const heading = payload[0]?.payload?.name ?? label;

  return (
    <div
      className="min-w-[150px] px-4 py-3 text-xs"
      style={{
        background: "var(--vui-gradient-card)",
        backdropFilter: "blur(120px)",
        border: "1px solid var(--nos-accent-border)",
        borderRadius: 16,
        boxShadow: "0 20px 27px rgba(0,0,0,0.5)",
      }}
    >
      {heading && <p className="mb-2 font-semibold text-[var(--nos-text-secondary)]">{heading}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="capitalize text-[var(--nos-text-secondary)]">{p.name}</span>
          </div>
          <span className="font-bold text-white">{fmt(p.value, prefix, suffix)}</span>
        </div>
      ))}
    </div>
  );
}

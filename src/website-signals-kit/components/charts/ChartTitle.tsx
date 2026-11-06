"use client";

import { CardInfoButton } from "../CardInfoButton";

/** Chart heading. The subtitle lives behind the eye button rather than under the title. */
export function ChartTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-base font-bold text-[var(--nos-text-primary)]">
      {title}
      <CardInfoButton description={subtitle ?? title} />
    </p>
  );
}

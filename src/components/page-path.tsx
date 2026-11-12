import { pageLabel } from "@/lib/page-labels";

/** A path with its context label, if the page has one. */
export function PagePath({ siteSlug, path }: { siteSlug: string | undefined; path: string }) {
  const label = pageLabel(siteSlug, path);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{path}</span>
      {label && <PageLabelPill label={label.label} note={label.note} />}
    </span>
  );
}

export function PageLabelPill({ label, note }: { label: string; note?: string }) {
  return (
    <span
      title={note}
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{
        background: "color-mix(in srgb, var(--nos-accent) 18%, transparent)",
        borderColor: "color-mix(in srgb, var(--nos-accent) 45%, transparent)",
      }}
    >
      {label}
    </span>
  );
}

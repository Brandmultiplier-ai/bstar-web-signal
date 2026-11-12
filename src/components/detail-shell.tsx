"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

import { useSites } from "@/lib/hooks";
import { rangeFromSearch, type RangeParams } from "@/lib/view-links";
import {
  RANGE_PRESETS,
  dateFilterFromStore,
  dateFilterSearch,
  dateFilterWindow,
  useDashboardStore,
  type DateFilter,
} from "@/store/dashboard-store";
import { DateRangePicker } from "@/components/date-range-picker";
import { Breadcrumbs } from "@/components/vision";
import { OpeningState } from "@/components/ui";
import { beginNavigation } from "@/store/navigation-store";
import type { SiteSummary } from "@/lib/api-types";

/**
 * Site and range for a full Page or Source view. A link carries both, so on
 * first load they are copied into the dashboard store; after that the store
 * (and the date picker) drives, and the address bar follows it so the link
 * stays shareable.
 */
export function useDetailContext(): {
  site: SiteSummary | undefined;
  range: DateFilter;
  isLoading: boolean;
  error: string | null;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: sites, isLoading, error } = useSites();
  const store = useDashboardStore();
  const urlRange = useMemo(() => rangeFromSearch(new URLSearchParams(params.toString())), [params]);
  const [applied, setApplied] = useState(false);
  const slug = params.get("site");

  useEffect(() => {
    if (applied) return;
    if (urlRange) applyRange(urlRange, store);
    setApplied(true);
  }, [applied, urlRange, store]);

  const site = sites?.find((item) => item.slug === slug);
  useEffect(() => {
    if (site && store.selectedSiteSlug !== site.slug) store.setSelectedSiteSlug(site.slug);
  }, [site, store]);

  const storeRange = dateFilterFromStore(store);
  const range: DateFilter = applied ? storeRange : (urlRange ?? storeRange);
  const search = dateFilterSearch(range);
  const lastSearch = useRef<string | null>(null);
  useEffect(() => {
    if (!applied) return;
    if (lastSearch.current === search) return;
    lastSearch.current = search;
    const next = new URLSearchParams(params.toString());
    for (const key of ["days", "start", "end", "all"]) next.delete(key);
    for (const [key, value] of new URLSearchParams(search)) next.set(key, value);
    if (next.toString() !== params.toString()) router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [applied, search, params, pathname, router]);

  return {
    site,
    range,
    isLoading,
    error: error instanceof Error ? error.message : sites && slug && !site ? `No site called "${slug}".` : null,
  };
}

function applyRange(range: RangeParams, store: ReturnType<typeof useDashboardStore.getState>) {
  if (range.all) return store.setAllTime();
  if (range.start && range.end) return store.setCustomRange(range.start, range.end);
  const days = range.days ?? 30;
  if ((RANGE_PRESETS as readonly number[]).includes(days)) return store.setRangeDays(days as (typeof RANGE_PRESETS)[number]);
  const window = dateFilterWindow({ days });
  if (window) store.setCustomRange(window.start, window.end);
}

/** Header and frame shared by the Page and Source views. */
export function DetailShell({
  trail,
  children,
  isLoading,
  error,
}: {
  trail: string[];
  children: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            onClick={() => beginNavigation("Loading")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white/5 px-3 py-2 text-xs text-[var(--nos-text-secondary)] hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <span className="hidden items-center gap-2 sm:flex">
            <span
              className="flex size-6 items-center justify-center rounded-lg"
              style={{ background: "var(--vui-gradient-brand)" }}
            >
              <Sparkles size={13} className="text-white" />
            </span>
            <Breadcrumbs trail={trail} />
          </span>
        </div>
        <DateRangePicker />
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-6 pb-16">
        {error ? (
          <p className="text-sm text-[var(--nos-negative)]">{error}</p>
        ) : isLoading ? (
          <OpeningState label="Loading" />
        ) : (
          children
        )}
      </main>
    </div>
  );
}

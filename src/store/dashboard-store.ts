"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  addDays,
  clampReadRange,
  formatLongDate,
  latestCompleteDay,
  toDateString,
} from "@/lib/dates";

export const RANGE_PRESETS = [7, 28, 90] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type DateFilter = {
  days?: number;
  start?: string;
  end?: string;
  all?: boolean;
};

type DashboardState = {
  /** Slug rather than UUID so the persisted value survives a reseed. */
  selectedSiteSlug: string | null;
  rangeDays: RangePreset;
  allTime: boolean;
  customStart: string | null;
  customEnd: string | null;
  setSelectedSiteSlug: (slug: string) => void;
  setRangeDays: (days: RangePreset) => void;
  setAllTime: () => void;
  setCustomRange: (start: string, end: string) => void;
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      selectedSiteSlug: null,
      rangeDays: 28,
      allTime: false,
      customStart: null,
      customEnd: null,
      setSelectedSiteSlug: (slug) => set({ selectedSiteSlug: slug }),
      setRangeDays: (rangeDays) =>
        set({ rangeDays, allTime: false, customStart: null, customEnd: null }),
      setAllTime: () => set({ allTime: true, customStart: null, customEnd: null }),
      setCustomRange: (start, end) => {
        const clamped = clampReadRange(start, end);
        set({ allTime: false, customStart: clamped.start, customEnd: clamped.end });
      },
    }),
    { name: "web-signals-ui" },
  ),
);

/** Query string for every metrics route. Custom start/end wins over presets. */
export function dateFilterFromStore(state: {
  rangeDays: RangePreset;
  allTime: boolean;
  customStart: string | null;
  customEnd: string | null;
}): DateFilter {
  if (state.allTime) return { all: true };
  if (state.customStart && state.customEnd) {
    return { start: state.customStart, end: state.customEnd };
  }
  return { days: state.rangeDays };
}

export function dateFilterSearch(filter: DateFilter): string {
  if (filter.all) return "all=1";
  if (filter.start && filter.end) return `start=${filter.start}&end=${filter.end}`;
  return `days=${filter.days ?? 28}`;
}

/** The window a filter covers, in `YYYY-MM-DD`. Null for All time. */
export function dateFilterWindow(filter: DateFilter): { start: string; end: string } | null {
  if (filter.all) return null;
  if (filter.start && filter.end) return { start: filter.start, end: filter.end };
  const end = latestCompleteDay();
  const days = filter.days ?? 28;
  return {
    start: toDateString(addDays(new Date(`${end}T00:00:00Z`), -(days - 1))),
    end,
  };
}

/** `6th Nov 2026 – 10th Nov 2026`, or `All time`. */
export function dateFilterLabel(filter: DateFilter): string {
  const window = dateFilterWindow(filter);
  if (!window) return "All time";
  return `${formatLongDate(window.start)} – ${formatLongDate(window.end)}`;
}

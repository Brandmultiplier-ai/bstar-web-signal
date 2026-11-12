"use client";

import { create } from "zustand";

import type { ReportView } from "@/lib/hooks";

/**
 * The open report tab. Not persisted, so a reload starts on the summary, but
 * it outlives client-side navigation: back from a Page or Source view returns
 * to the tab it was opened from.
 */
export const useDashboardViewStore = create<{ view: ReportView; setView: (view: ReportView) => void }>()((set) => ({
  view: "summary",
  setView: (view) => set({ view }),
}));

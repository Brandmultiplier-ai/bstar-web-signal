"use client";

import { create } from "zustand";

/** The page open in the drill-in panel. Not persisted: a reload starts closed. */
type PageDrillState = {
  page: { siteId: string; path: string } | null;
  open: (siteId: string, path: string) => void;
  close: () => void;
};

export const usePageDrillStore = create<PageDrillState>()((set) => ({
  page: null,
  open: (siteId, path) => set({ page: { siteId, path } }),
  close: () => set({ page: null }),
}));

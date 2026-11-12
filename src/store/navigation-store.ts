"use client";

import { create } from "zustand";

/**
 * The click that leaves the current screen. Set in the click handler, before
 * the next page exists, and cleared when that page has something to show.
 */
export const useNavigationStore = create<{
  label: string | null;
  begin: (label: string) => void;
  clear: () => void;
}>()((set) => ({
  label: null,
  begin: (label) => set({ label }),
  clear: () => set({ label: null }),
}));

export function beginNavigation(label: string) {
  useNavigationStore.getState().begin(label);
}

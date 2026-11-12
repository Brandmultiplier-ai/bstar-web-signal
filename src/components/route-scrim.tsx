"use client";

import { LoadingScrim } from "@/components/ui";
import { useNavigationStore } from "@/store/navigation-store";

/** Blurs the whole screen from the click until the next page has something to show. */
export function RouteScrim() {
  const label = useNavigationStore((state) => state.label);
  if (!label) return null;
  return <LoadingScrim label={label} fixed />;
}

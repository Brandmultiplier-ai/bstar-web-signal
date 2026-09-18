"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  CalendlyResponse,
  ClarityResponse,
  Ga4Response,
  GscResponse,
  SiteSummary,
  WebsiteSignalsResponse,
} from "@/lib/api-types";
import { dateFilterSearch, type DateFilter } from "@/store/dashboard-store";

/**
 * TanStack Query only ever talks to our own API routes, which read only from
 * our own tables. No hook here reaches a third-party API.
 */
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request to ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: () => getJson<{ sites: SiteSummary[] }>("/api/sites"),
    staleTime: 60 * 60_000,
    select: (data) => data.sites,
  });
}

/** Per-site sources. Disabled until a site is chosen, so no siteless request. */
export function useGa4(siteId: string | undefined, range: DateFilter) {
  const q = dateFilterSearch(range);
  return useQuery({
    queryKey: ["ga4", siteId, q],
    queryFn: () => getJson<Ga4Response>(`/api/metrics/ga4?siteId=${siteId}&${q}`),
    enabled: Boolean(siteId),
  });
}

export function useGsc(siteId: string | undefined, range: DateFilter) {
  const q = dateFilterSearch(range);
  return useQuery({
    queryKey: ["gsc", siteId, q],
    queryFn: () => getJson<GscResponse>(`/api/metrics/gsc?siteId=${siteId}&${q}`),
    enabled: Boolean(siteId),
  });
}

export function useWebsiteSignals(siteId: string | undefined, range: DateFilter) {
  const q = dateFilterSearch(range);
  return useQuery({
    queryKey: ["website-signals", siteId, q],
    queryFn: () =>
      getJson<WebsiteSignalsResponse>(`/api/metrics/website-signals?siteId=${siteId}&${q}`),
    enabled: Boolean(siteId),
  });
}

export function useClarity(range: DateFilter, siteId?: string) {
  const q = dateFilterSearch(range);
  return useQuery({
    queryKey: ["clarity", q, siteId ?? "all"],
    queryFn: () =>
      getJson<ClarityResponse>(
        `/api/metrics/clarity?${q}${siteId ? `&siteId=${siteId}` : ""}`,
      ),
  });
}

export function useCalendly(range: DateFilter) {
  const q = dateFilterSearch(range);
  return useQuery({
    queryKey: ["calendly", q],
    queryFn: () => getJson<CalendlyResponse>(`/api/metrics/calendly?${q}`),
  });
}

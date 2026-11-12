"use client";

import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";

import type {
  CalendlyResponse,
  ClarityResponse,
  Ga4Response,
  GscResponse,
  LeadsResponse,
  PageDetailResponse,
  SiteSummary,
  SourceDetailResponse,
  SummaryResponse,
  WebsiteSignalsResponse,
} from "@/lib/api-types";
import { dateFilterSearch, type DateFilter } from "@/store/dashboard-store";

/**
 * TanStack Query only ever talks to our own API routes, which read only from
 * our own tables. No hook here reaches a third-party API.
 */
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request to ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/**
 * A new date range keeps the same site's last answer on screen while the new
 * one loads. A different site never shows the previous site's numbers.
 */
function sameSitePlaceholder<T>(siteId: string | undefined) {
  return (previous: T | undefined, query: { queryKey: readonly unknown[] } | undefined) =>
    query && query.queryKey[1] === siteId ? previous : undefined;
}

export const reportQueries = {
  summary: (siteId: string | undefined, range: DateFilter) => {
    const q = dateFilterSearch(range);
    return queryOptions({
      queryKey: ["summary", siteId, q] as const,
      queryFn: () => getJson<SummaryResponse>(`/api/metrics/summary?siteId=${siteId}&${q}`),
      enabled: Boolean(siteId),
    });
  },
  signals: (siteId: string | undefined, range: DateFilter) => {
    const q = dateFilterSearch(range);
    return queryOptions({
      queryKey: ["website-signals", siteId, q] as const,
      queryFn: () =>
        getJson<WebsiteSignalsResponse>(`/api/metrics/website-signals?siteId=${siteId}&${q}`),
      enabled: Boolean(siteId),
    });
  },
  ga4: (siteId: string | undefined, range: DateFilter) => {
    const q = dateFilterSearch(range);
    return queryOptions({
      queryKey: ["ga4", siteId, q] as const,
      queryFn: () => getJson<Ga4Response>(`/api/metrics/ga4?siteId=${siteId}&${q}`),
      enabled: Boolean(siteId),
    });
  },
  gsc: (siteId: string | undefined, range: DateFilter) => {
    const q = dateFilterSearch(range);
    return queryOptions({
      queryKey: ["gsc", siteId, q] as const,
      queryFn: () => getJson<GscResponse>(`/api/metrics/gsc?siteId=${siteId}&${q}`),
      enabled: Boolean(siteId),
    });
  },
  clarity: (siteId: string | undefined, range: DateFilter) => {
    const q = dateFilterSearch(range);
    return queryOptions({
      queryKey: ["clarity", siteId ?? "all", q] as const,
      queryFn: () =>
        getJson<ClarityResponse>(`/api/metrics/clarity?${q}${siteId ? `&siteId=${siteId}` : ""}`),
    });
  },
  calendly: (range: DateFilter) => {
    const q = dateFilterSearch(range);
    return queryOptions({
      queryKey: ["calendly", "all", q] as const,
      queryFn: () => getJson<CalendlyResponse>(`/api/metrics/calendly?${q}`),
    });
  },
  leads: (siteId: string | undefined, range: DateFilter) => {
    const q = dateFilterSearch(range);
    return queryOptions({
      queryKey: ["leads", siteId, q] as const,
      queryFn: () => getJson<LeadsResponse>(`/api/metrics/leads?siteId=${siteId}&${q}`),
      enabled: Boolean(siteId),
    });
  },
};

export type ReportView = "summary" | "signals" | "ga4" | "gsc" | "clarity" | "calendly" | "leads";

/** Warms a tab's cache so opening it renders from memory. */
export function prefetchView(
  client: QueryClient,
  view: ReportView,
  siteId: string | undefined,
  range: DateFilter,
) {
  if (!siteId && view !== "calendly") return;
  const options =
    view === "calendly" ? reportQueries.calendly(range) : reportQueries[view](siteId, range);
  void client.prefetchQuery(options as Parameters<QueryClient["prefetchQuery"]>[0]);
}

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: () => getJson<{ sites: SiteSummary[] }>("/api/sites"),
    staleTime: 60 * 60_000,
    select: (data) => data.sites,
  });
}

export function useSummary(siteId: string | undefined, range: DateFilter) {
  return useQuery({
    ...reportQueries.summary(siteId, range),
    placeholderData: sameSitePlaceholder<SummaryResponse>(siteId),
  });
}

export function useGa4(siteId: string | undefined, range: DateFilter) {
  return useQuery({
    ...reportQueries.ga4(siteId, range),
    placeholderData: sameSitePlaceholder<Ga4Response>(siteId),
  });
}

export function useGsc(siteId: string | undefined, range: DateFilter) {
  return useQuery({
    ...reportQueries.gsc(siteId, range),
    placeholderData: sameSitePlaceholder<GscResponse>(siteId),
  });
}

export function useWebsiteSignals(siteId: string | undefined, range: DateFilter) {
  return useQuery({
    ...reportQueries.signals(siteId, range),
    placeholderData: sameSitePlaceholder<WebsiteSignalsResponse>(siteId),
  });
}

export function useClarity(range: DateFilter, siteId?: string) {
  return useQuery({
    ...reportQueries.clarity(siteId, range),
    placeholderData: sameSitePlaceholder<ClarityResponse>(siteId ?? "all"),
  });
}

export function useCalendly(range: DateFilter) {
  return useQuery({
    ...reportQueries.calendly(range),
    placeholderData: sameSitePlaceholder<CalendlyResponse>("all"),
  });
}

export function useLeads(siteId: string | undefined, range: DateFilter) {
  return useQuery({
    ...reportQueries.leads(siteId, range),
    placeholderData: sameSitePlaceholder<LeadsResponse>(siteId),
  });
}

/** Stored rows for one page. Only runs while a page is open in the drill-in. */
export function usePageDetail(siteId: string | undefined, path: string | null, range: DateFilter) {
  const q = dateFilterSearch(range);
  return useQuery({
    queryKey: ["page", siteId, path, q] as const,
    queryFn: () =>
      getJson<PageDetailResponse>(
        `/api/metrics/page?siteId=${siteId}&path=${encodeURIComponent(path ?? "")}&${q}`,
      ),
    enabled: Boolean(siteId && path),
  });
}

/** Stored rows for one traffic source of one site. */
export function useSourceDetail(
  siteId: string | undefined,
  source: string | null,
  medium: string | null,
  range: DateFilter,
) {
  const q = dateFilterSearch(range);
  return useQuery({
    queryKey: ["source", siteId, source, medium, q] as const,
    queryFn: () =>
      getJson<SourceDetailResponse>(
        `/api/metrics/source?siteId=${siteId}&source=${encodeURIComponent(source ?? "")}&medium=${encodeURIComponent(medium ?? "")}&${q}`,
      ),
    enabled: Boolean(siteId && source !== null && medium !== null),
  });
}

import { env } from "@/lib/env";

const LIVE_INSIGHTS_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

/** Dimensions the live-insights endpoint accepts, up to three per call. */
export type ClarityDimension = "URL" | "Device" | "Country" | "OS" | "Browser" | "Source";

/**
 * One entry per metric. Clarity returns a flat array of these, each carrying a
 * differently-shaped `information` payload, so callers pick fields by name.
 *
 * Values arrive inconsistently typed: the same field is a number on one metric
 * and a quoted string on another, so everything goes through `numeric()`.
 */
export type ClarityMetric = {
  metricName: string;
  information: Array<Record<string, string | number | null>>;
};

/**
 * Fetches Clarity's live-insights aggregate for the trailing `numOfDays`.
 *
 * Two hard limits shape everything downstream:
 *  - `numOfDays` accepts only 1, 2 or 3. There is no historical range.
 *    We persist each pull as yesterday and keep older rows, so the dashboard
 *    can show 10 or 20 stored days even though Microsoft never sends them
 *    in one call.
 *  - The project is capped at 10 requests per day. A run uses URL plus
 *    Device, Browser, Source, Country and OS — six calls, inside the cap.
 *
 * Passing `dimensions` breaks each metric down by those fields instead of
 * returning a single project-wide aggregate.
 */
export async function fetchClarityInsights(
  numOfDays: 1 | 2 | 3,
  dimensions: ClarityDimension[] = [],
): Promise<ClarityMetric[]> {
  const url = new URL(LIVE_INSIGHTS_URL);
  url.searchParams.set("numOfDays", String(numOfDays));
  dimensions.slice(0, 3).forEach((dimension, index) => {
    url.searchParams.set(`dimension${index + 1}`, dimension);
  });

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.clarityApiToken()}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Clarity API returned ${response.status} for numOfDays=${numOfDays}: ${body.slice(0, 300)}`,
    );
  }

  return (await response.json()) as ClarityMetric[];
}

/** Coerces Clarity's mixed string/number fields to a number, or null. */
export function numeric(raw: string | number | null | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function findMetric(
  metrics: ClarityMetric[],
  metricName: string,
): Array<Record<string, string | number | null>> {
  return metrics.find((metric) => metric.metricName === metricName)?.information ?? [];
}

/** Reads a numeric field from a named metric's first information entry. */
export function metricValue(
  metrics: ClarityMetric[],
  metricName: string,
  field: string,
): number | null {
  return numeric(findMetric(metrics, metricName)[0]?.[field]);
}

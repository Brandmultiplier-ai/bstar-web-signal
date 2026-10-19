/** Tiny number helpers shared by the dashboard and the summary copy. */

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Stated on a panel when the rows underneath are not a full split of the headline. */
export function partialCoverage(shown: number, total: number, noun: string): string | null {
  if (total <= 0 || shown >= total) return null;
  return `These rows cover ${formatNumber(shown)} of ${formatNumber(total)} ${noun} in this range — not a full breakdown.`;
}

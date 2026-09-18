/** Tiny number helpers shared by the dashboard and the summary copy. */

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

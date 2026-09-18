export function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${v}M`;
  }
  if (n >= 1_000) {
    const v = (n / 1_000).toFixed(1).replace(/\.0$/, "");
    return `${v}K`;
  }
  return Math.round(n).toLocaleString();
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

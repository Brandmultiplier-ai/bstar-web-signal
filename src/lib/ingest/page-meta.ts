/**
 * Reads what a page says about itself from its HTML: title, meta
 * description, first heading and canonical URL. Pure, so it is tested
 * without fetching anything.
 */

export type ParsedPageMeta = {
  title: string | null;
  description: string | null;
  h1: string | null;
  canonical_url: string | null;
};

const MAX_TEXT = 500;

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const value = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

function tidy(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = decodeEntities(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[2] ?? match[3] ?? match[4] ?? null) : null;
}

/** First `<meta>` or `<link>` whose attribute `key` equals one of `values`. */
function findTag(html: string, tagName: "meta" | "link", key: string, values: string[], read: string): string | null {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
  for (const value of values) {
    for (const tag of tags) {
      const own = attribute(tag, key);
      if (own && own.toLowerCase().split(/\s+/).includes(value)) {
        const content = attribute(tag, read);
        if (content && content.trim()) return content;
      }
    }
  }
  return null;
}

export function parsePageMeta(html: string): ParsedPageMeta {
  const head = html.slice(0, 400_000);
  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const description =
    findTag(head, "meta", "name", ["description"], "content") ??
    findTag(head, "meta", "property", ["og:description"], "content") ??
    findTag(head, "meta", "name", ["twitter:description"], "content");
  const ogTitle = findTag(head, "meta", "property", ["og:title"], "content");
  const body = head.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ");
  const h1 = body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? null;
  const canonical = findTag(head, "link", "rel", ["canonical"], "href");

  return {
    title: tidy(title) ?? tidy(ogTitle),
    description: tidy(description),
    h1: tidy(h1),
    canonical_url: canonical?.trim() || null,
  };
}

/** GA4 paths worth fetching: real paths only, most viewed first. */
export function pickPaths(rows: Array<{ page_path: string; pageviews: number }>, limit: number): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const path = row.page_path.trim();
    if (!path.startsWith("/") || path.startsWith("//") || /\s/.test(path) || path.length > 1024) continue;
    totals.set(path, (totals.get(path) ?? 0) + row.pageviews);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path]) => path);
}

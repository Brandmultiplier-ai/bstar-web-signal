import { sourceLabel } from "../source-labels";
import type { PageDetail } from "./page-detail";

/**
 * Plain-English reading of one page's stored numbers. Rule-based and pure:
 * every sentence comes from a number on the page, never from a guess about
 * what the page is for.
 */

export type PageInsight = { tone: "good" | "bad" | "neutral"; text: string };

type Input = Pick<PageDetail, "kpis" | "behaviour" | "sources" | "coverage" | "forms" | "conversions">;

/** Below this many sessions a rate swings on one or two visits. */
const SMALL_SAMPLE = 10;
const SHORT_ACTIVE_SECONDS = 20;
const FULL_SCROLL_PCT = 90;

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

export function buildPageInsights(input: Input): PageInsight[] {
  const out: PageInsight[] = [];
  const { kpis, behaviour, coverage } = input;
  const sessions = kpis.sessions.current;
  const landings = kpis.landingSessions.current;
  const days = plural(coverage.days, "day");

  if (sessions !== null && sessions > 0) {
    const views = kpis.views.current ?? 0;
    const entered = landings !== null && landings > 0 ? `, ${plural(Math.round(landings), "visit")} started here` : "";
    out.push({
      tone: "neutral",
      text: `${plural(Math.round(sessions), "visit")} included this page over ${days} (${plural(Math.round(views), "view")}${entered}).`,
    });
    if (landings !== null && landings / sessions >= 0.8 && sessions >= SMALL_SAMPLE) {
      out.push({
        tone: "neutral",
        text: "Nearly every visit that saw this page started on it: people arrive here from outside the site (a link, a search or the address typed in), not by clicking through from another page.",
      });
    }
  }

  if (input.sources.available) {
    const total = input.sources.rows.reduce((sum, row) => sum + row.sessions, 0);
    const top = input.sources.rows[0];
    if (top && total > 0) {
      const label = sourceLabel(top.source, top.medium);
      const share = top.sessions / total;
      out.push({
        tone: "neutral",
        text: `${share >= 0.5 ? "Most" : "The largest group of"} visits that started here came from ${label.name} (${pct(share)}). ${label.explain}`,
      });
      if (label.kind === "email" && share >= 0.5) {
        out.push({
          tone: "neutral",
          text: "Because email drives this page, its traffic rises and falls with email sends rather than with search or the site's other pages.",
        });
      }
    }
  }

  const scroll = kpis.scrollDepthPct.current;
  const active = kpis.activeTimeSeconds.current;
  if (scroll !== null && active !== null && scroll >= FULL_SCROLL_PCT && active < SHORT_ACTIVE_SECONDS) {
    out.push({
      tone: "neutral",
      text: `Scroll depth is ${Math.round(scroll)}% but visitors were active for only ${Math.round(active)}s. The page is short, or sends people on quickly: reaching the bottom here does not mean they read it.`,
    });
  }

  const bounce = kpis.bounceRate.current;
  if (bounce !== null && sessions !== null && sessions >= SMALL_SAMPLE) {
    if (bounce >= 0.7) {
      out.push({ tone: "bad", text: `${pct(bounce)} of visits with this page did not engage: under 10 seconds, one page, no conversion.` });
    } else if (bounce <= 0.25) {
      out.push({ tone: "good", text: `Only ${pct(bounce)} of visits with this page bounced; most went on to engage.` });
    }
  }

  const converted =
    input.conversions.reduce((sum, row) => sum + row.count, 0) + (input.forms.available ? input.forms.submissions : 0);
  if (converted > 0) {
    out.push({ tone: "good", text: `${plural(converted, "conversion")} came from this page in this range.` });
  }

  if (sessions !== null && sessions > 0 && sessions < SMALL_SAMPLE) {
    out.push({
      tone: "neutral",
      text: `Only ${plural(Math.round(sessions), "visit")} in this range. Treat the rates as anecdotal.`,
    });
  } else if (behaviour.sessions > 0 && behaviour.sessions < SMALL_SAMPLE) {
    out.push({
      tone: "neutral",
      text: `Clarity saw only ${plural(behaviour.sessions, "session")} on this page. Treat its behaviour numbers as anecdotal.`,
    });
  }

  return out;
}

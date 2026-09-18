import { formatNumber } from "@/lib/format";
import type { SectionTldr } from "@/website-signals-kit/lib/types";

/**
 * Founder-facing copy generated from stored numbers. No LLM, no extra API —
 * the same tables the charts read.
 */

export function overviewTldr(input: {
  domain: string;
  sessions: number;
  sessionChange: number;
  bounceRate: number | null;
  topPage: string | null;
  topSource: string | null;
  topCountry: string | null;
  rageClickPct: number | null;
}): SectionTldr {
  const bounce =
    input.bounceRate === null ? null : Math.round(input.bounceRate * 100);
  const change =
    input.sessionChange === 0
      ? "about the same as the previous window"
      : input.sessionChange > 0
        ? `${input.sessionChange.toFixed(0)}% above the previous window`
        : `${Math.abs(input.sessionChange).toFixed(0)}% below the previous window`;

  const parts = [
    `${input.domain} recorded ${formatNumber(input.sessions)} sessions, ${change}.`,
  ];
  if (bounce !== null) {
    parts.push(
      bounce >= 70
        ? `Bounce is high at ${bounce}% — most visits leave after one page.`
        : `Bounce sits at ${bounce}%.`,
    );
  }
  if (input.topSource) {
    parts.push(`The leading source is ${input.topSource}.`);
  }
  if (input.topPage) {
    parts.push(`The busiest path is ${input.topPage}.`);
  }
  if (input.topCountry) {
    parts.push(`Most sessions came from ${input.topCountry}.`);
  }
  if (input.rageClickPct !== null && input.rageClickPct >= 5) {
    parts.push(
      `Rage clicks are at ${input.rageClickPct.toFixed(1)}% of sessions — something on the page is frustrating people.`,
    );
  }

  const actions: SectionTldr["actions"] = [];
  if (bounce !== null && bounce >= 70 && input.topPage) {
    actions.push({
      title: `Tighten ${input.topPage}`,
      description:
        "Most people leave after one page. Check that the landing promise matches the next step, and that the primary CTA is obvious above the fold.",
      priority: "high",
      cta: "Open Analytics",
    });
  }
  if (input.rageClickPct !== null && input.rageClickPct >= 5) {
    actions.push({
      title: "Fix rage-click hotspots",
      description:
        "Rage clicks mean a control looks clickable but does nothing, or a form is stuck. Open Behavior and sort pages by rage rate.",
      priority: "high",
      cta: "Open Behavior",
    });
  }
  if (input.topSource?.toLowerCase().includes("direct")) {
    actions.push({
      title: "Direct is dominating",
      description:
        "Direct often hides branded search, bookmarks, and dark social. Pair this with Search Console once it is connected to see the queries behind those visits.",
      priority: "medium",
      cta: "Open Search",
    });
  }
  if (actions.length === 0) {
    actions.push({
      title: "Watch the landing mix",
      description:
        "Traffic is not flashing a single red flag. Use Analytics for where sessions start, and Behavior for whether those pages actually get read.",
      priority: "medium",
      cta: "Open Analytics",
    });
  }

  return { summary: parts.join(" "), actions: actions.slice(0, 3) };
}

export const REPORT_BLURBS = {
  overview:
    "A snapshot of this site from stored Google Analytics and Clarity numbers. Date changes re-read every saved day in the database — they never call the live APIs.",
  ga4: "Google Analytics (GA4) for this hostname: how many people arrived, where they came from, which page they landed on, and how long they stayed.",
  gsc: "Google Search Console: the queries, clicks, and impressions Google Search actually reported for this property.",
  clarity:
    "Microsoft Clarity: how people behaved on the page — scroll, rage clicks, dead clicks, quick backs, and script errors.",
  calendly:
    "Calendly bookings stored from the connected account. Date chips filter those saved rows. Attribution comes from UTM parameters on the booking link, not from the page domain.",
} as const;

/** Shown at the top of every report so the API window is never a surprise. */
export const SOURCE_WINDOW_NOTES = {
  overview:
    "Every chart is stored history. Date chips never call Google or Microsoft — they filter days already in our tables. After enough successful pulls, 10d / 28d / All time will show that many stored days. Microsoft only hands over yesterday for Clarity; we keep that yesterday forever. Scheduled pulls need the app on a public URL.",
  ga4: "Google Analytics days are copied into our tables and kept. Changing 7d / 28d / 90d / All time only re-reads those stored days. New days land when ingest runs.",
  gsc: "Search Console days are copied into our tables and kept. Reports lag about two days. Date chips only read stored clicks, impressions, and queries.",
  clarity:
    "Microsoft only returns yesterday on each pull. We save that day permanently. After 10 successful daily pulls this tab shows 10 days; All time shows every saved day. A missed pull cannot be recovered from Microsoft later.",
  calendly:
    "Calendly bookings are copied into our tables and kept. Date chips only filter those stored rows — they never call Calendly live. New and cancelled meetings land when ingest runs.",
} as const;

export const CLARITY_METRIC_DEFS = {
  rage: "Rage click: the visitor hammered the same spot three or more times in a row. Usually a button, link, or control that looks clickable but does nothing.",
  dead: "Dead click: a click on something that has no action — decorative text, a non-interactive image, or a disabled control.",
  quickBack:
    "Quick back: the visitor left the page within a few seconds and went back. They did not find what the landing promised.",
  jsError:
    "JavaScript error: a script exception ran during the session. High rates usually mean a broken form, widget, or third-party tag.",
  scroll: "Scroll depth: how far down the page an average session reached, as a percent of page height.",
  excessive:
    "Excessive scroll: the visitor kept scrolling without pausing — often a sign they cannot find the next step.",
} as const;

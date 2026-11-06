export type InsightKpi = {
  id: string;
  label: string;
  format: "number" | "percent" | "position";
  goodWhen: "up" | "down";
} & (
  | { available: true; current: number; previous: number | null; change: number | null }
  | { available: false; reason: string }
);

type Mover = { key: string; current: number; previous: number; difference: number };
type MoverSet = { risers: Mover[]; fallers: Mover[] };

export type DailyPoint = { date: string; sessions: number | null; clicks: number | null };

export type Insight = { tone: "good" | "bad" | "neutral"; text: string };

export type InsightInput = {
  kpis: InsightKpi[];
  changed: { pages: MoverSet; queries: MoverSet; channels: MoverSet } | null;
  daily: DailyPoint[];
};

/** Moves smaller than this are noise and are not called out. */
const MIN_CHANGE = 0.05;
const LIMIT = 6;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const count = (value: number) => Math.round(value).toLocaleString("en-US");
const pct = (change: number) => `${Math.abs(change * 100).toFixed(0)}%`;

function show(kpi: Extract<InsightKpi, { available: true }>, value: number): string {
  if (kpi.format === "percent") return `${value.toFixed(1)}%`;
  if (kpi.format === "position") return value.toFixed(1);
  return count(value);
}

/** "rose 12% to 40 (was 36)", or for a rank, where a lower number is better, "slipped from 8.4 to 9.3". */
function movement(kpi: Extract<InsightKpi, { available: true }>, change: number, previous: number) {
  if (kpi.format === "position") {
    return `${change > 0 ? "slipped" : "improved"} from ${show(kpi, previous)} to ${show(kpi, kpi.current)}`;
  }
  return `${change > 0 ? "rose" : "fell"} ${pct(change)} to ${show(kpi, kpi.current)} (was ${show(kpi, previous)})`;
}

function isBetter(kpi: InsightKpi & { available: true }, change: number) {
  return (change > 0) === (kpi.goodWhen === "up");
}

/**
 * Plain-language findings for the selected range, ranked by how much they
 * matter. Built only from the stored figures passed in; nothing is guessed.
 */
export function buildInsights({ kpis, changed, daily }: InsightInput): Insight[] {
  const out: Insight[] = [];
  const byId = new Map(kpis.map((kpi) => [kpi.id, kpi]));
  const moved = kpis.filter(
    (kpi): kpi is Extract<InsightKpi, { available: true }> & { change: number; previous: number } =>
      kpi.available && kpi.change !== null && kpi.previous !== null && Math.abs(kpi.change) >= MIN_CHANGE,
  );

  const best = moved
    .filter((kpi) => isBetter(kpi, kpi.change))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (best) {
    out.push({
      tone: "good",
      text: `${best.label} ${movement(best, best.change, best.previous)}, the strongest improvement in this range.`,
    });
  }

  const worst = moved
    .filter((kpi) => !isBetter(kpi, kpi.change))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (worst) {
    out.push({
      tone: "bad",
      text: `${worst.label} ${movement(worst, worst.change, worst.previous)}. This is the first thing to look at.`,
    });
  }

  const sessions = byId.get("sessions");
  const bookings = byId.get("bookings");
  if (
    sessions?.available && bookings?.available &&
    sessions.change !== null && sessions.change >= MIN_CHANGE &&
    bookings.previous !== null && bookings.previous > 0 && bookings.current <= bookings.previous
  ) {
    out.push({
      tone: "bad",
      text: `Visits grew ${pct(sessions.change)} but sales calls booked did not follow (${count(bookings.current)} vs ${count(bookings.previous)}). The extra traffic is not converting.`,
    });
  }

  const impressions = byId.get("impressions");
  const ctr = byId.get("ctr");
  if (
    impressions?.available && ctr?.available &&
    impressions.change !== null && ctr.change !== null &&
    impressions.change >= MIN_CHANGE && ctr.change <= -MIN_CHANGE
  ) {
    out.push({
      tone: "neutral",
      text: `Google showed the site ${pct(impressions.change)} more often, but a smaller share of searchers clicked (${show(ctr, ctr.current)} vs ${show(ctr, ctr.previous!)}). Page titles and descriptions may need work for the new searches.`,
    });
  }

  const channel = changed?.channels.risers[0];
  if (channel && channel.difference > 0) {
    out.push({
      tone: "good",
      text: `${channel.key} brought ${count(channel.difference)} more visits than the period before (${count(channel.current)} vs ${count(channel.previous)}).`,
    });
  }
  const lostChannel = changed?.channels.fallers[0];
  if (lostChannel) {
    out.push({
      tone: "bad",
      text: `${lostChannel.key} sent ${count(-lostChannel.difference)} fewer visits (${count(lostChannel.current)} vs ${count(lostChannel.previous)}).`,
    });
  }

  const page = changed?.pages.risers[0];
  if (page) {
    out.push({
      tone: "good",
      text: `${page.key} gained the most views: ${count(page.current)}, up ${count(page.difference)}.`,
    });
  }

  const query = changed?.queries.risers[0];
  if (query) {
    out.push({
      tone: "good",
      text: `The search "${query.key}" gained the most clicks: ${count(query.current)}, up ${count(query.difference)}.`,
    });
  }

  const stored = daily.filter((point) => point.sessions !== null);
  if (stored.length >= 7) {
    const peak = stored.reduce((top, point) => (point.sessions! > top.sessions! ? point : top));
    const weekday = WEEKDAYS[new Date(`${peak.date}T00:00:00Z`).getUTCDay()];
    out.push({
      tone: "neutral",
      text: `The busiest day was ${weekday} ${peak.date} with ${count(peak.sessions!)} visits.`,
    });
  }

  const missing = kpis.filter((kpi) => !kpi.available).length;
  if (missing > 0) {
    out.push({
      tone: "neutral",
      text: `${missing} figure${missing === 1 ? " has" : "s have"} no data for this range. The eye on each tile says why.`,
    });
  }

  if (out.length === 0) {
    out.push({
      tone: "neutral",
      text: changed
        ? "Nothing moved by more than 5% against the previous period."
        : "All time has no earlier period, so only totals are shown. Pick a date range to see what changed.",
    });
  }

  return out.slice(0, LIMIT);
}

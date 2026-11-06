import { addDays, inclusiveDays, toDateString } from "../dates";

export type Window = { start: string; end: string };

/** The window of the same length that ends the day before `current` starts. */
export function previousWindow(current: Window): Window {
  const days = inclusiveDays(current.start, current.end);
  const start = new Date(`${current.start}T00:00:00Z`);
  return {
    start: toDateString(addDays(start, -days)),
    end: toDateString(addDays(start, -1)),
  };
}

export type Delta = {
  current: number | null;
  previous: number | null;
  /** Relative change, or null when there is no baseline to compare with. */
  change: number | null;
};

export function delta(current: number | null, previous: number | null): Delta {
  const change =
    current === null || previous === null || previous === 0 ? null : (current - previous) / previous;
  return { current, previous, change };
}

export type Mover = { key: string; current: number; previous: number; difference: number };

/**
 * Largest absolute changes between two keyed totals. A key present in only
 * one window counts as zero in the other.
 */
export function movers(
  current: Map<string, number>,
  previous: Map<string, number>,
  limit = 5,
): { risers: Mover[]; fallers: Mover[] } {
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const rows: Mover[] = [...keys].map((key) => {
    const now = current.get(key) ?? 0;
    const before = previous.get(key) ?? 0;
    return { key, current: now, previous: before, difference: now - before };
  });
  return {
    risers: rows
      .filter((row) => row.difference > 0)
      .sort((a, b) => b.difference - a.difference || a.key.localeCompare(b.key))
      .slice(0, limit),
    fallers: rows
      .filter((row) => row.difference < 0)
      .sort((a, b) => a.difference - b.difference || a.key.localeCompare(b.key))
      .slice(0, limit),
  };
}

export function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = key(row);
    totals.set(name, (totals.get(name) ?? 0) + value(row));
  }
  return totals;
}

export function inWindow(date: string, window: Window): boolean {
  const day = date.slice(0, 10);
  return day >= window.start && day <= window.end;
}

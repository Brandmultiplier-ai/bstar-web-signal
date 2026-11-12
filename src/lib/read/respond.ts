import { NextResponse } from "next/server";

export type RequestTimer = {
  mark: (name: string) => void;
  header: () => string;
};

/** Server-Timing phases (auth, db, total) so the browser's network tab shows where time went. */
export function startTimer(): RequestTimer {
  const started = performance.now();
  let last = started;
  const phases: Array<[string, number]> = [];
  return {
    mark(name) {
      const now = performance.now();
      phases.push([name, now - last]);
      last = now;
    },
    header() {
      const total = performance.now() - started;
      return [...phases, ["total", total] as [string, number]]
        .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
        .join(", ");
    },
  };
}

/**
 * A table whose migration is not applied yet, or that PostgREST's schema
 * cache has not picked up. That means "not collected yet", not an error.
 */
export function missingRelation(error: { message: string; code?: string } | null): boolean {
  return Boolean(
    error && (error.code === "42P01" || /could not find the table|schema cache|does not exist/i.test(error.message)),
  );
}

/**
 * Stored reports change at most daily. A short private cache lets the
 * browser reuse an answer on back and forward without a new read.
 */
export function readJson(body: unknown, timer: RequestTimer, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": status === 200 ? "private, max-age=60" : "no-store",
      "Server-Timing": timer.header(),
    },
  });
}

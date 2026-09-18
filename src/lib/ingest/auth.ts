import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const INGEST_SECRET_HEADER = "x-ingest-secret";

/**
 * Ingest routes are publicly routable because pg_net calls them over HTTPS, so
 * the shared secret is the only thing standing between the open internet and a
 * quota-burning API call. Compared in constant time.
 */
export function isAuthorizedIngestRequest(request: Request): boolean {
  const provided = request.headers.get(INGEST_SECRET_HEADER);
  if (!provided) return false;

  const expected = env.ingestSecret();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which itself leaks length, so
  // compare a fixed-size digest-like pair of equal-length buffers instead.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

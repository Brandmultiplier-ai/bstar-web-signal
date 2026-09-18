import type { Site } from "@/lib/database.types";
import type { ScheduledSource } from "@/lib/sources";
import type { AdminClient } from "@/lib/supabase/types";

export type IngestContext = {
  admin: AdminClient;
  /** Active sites only. Each ingestor filters further on its own config. */
  sites: Site[];
  window: { start: string; end: string };
};

export type IngestResult = {
  rowsWritten: number;
  /** Per-table or per-site counts, echoed back in the route response so a
   * manual curl against the endpoint is self-explaining. */
  details?: Record<string, number>;
  /** Sites or projects skipped for missing config, surfaced for the same reason. */
  skipped?: string[];
};

export type Ingestor = {
  source: ScheduledSource;
  run: (ctx: IngestContext) => Promise<IngestResult>;
};

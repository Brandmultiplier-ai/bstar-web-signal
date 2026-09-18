import { ga4Ingestor } from "@/lib/ingest/sources/ga4";
import { gscIngestor } from "@/lib/ingest/sources/gsc";
import { clarityIngestor } from "@/lib/ingest/sources/clarity";
import { calendlyIngestor } from "@/lib/ingest/sources/calendly";
import type { Ingestor } from "@/lib/ingest/types";
import type { ScheduledSource } from "@/lib/sources";

export const INGESTORS: Record<ScheduledSource, Ingestor> = {
  ga4: ga4Ingestor,
  gsc: gscIngestor,
  clarity: clarityIngestor,
  calendly: calendlyIngestor,
};

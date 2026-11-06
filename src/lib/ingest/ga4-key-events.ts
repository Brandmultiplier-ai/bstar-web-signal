import { GA4_FORM_ID_DIMENSION, GA4_PLACEMENT_DIMENSION } from "@/lib/sources";
import type { Ga4EventKey } from "@/lib/database.types";

const CORE_DIMENSIONS = ["date", "hostName", "eventName", "pagePath"] as const;

export type KeyEventAttempt = {
  dimensions: string[];
  /** True when the report includes customEvent:form_id, so empty values can be dropped. */
  formIdKnown: boolean;
  hasPlacement: boolean;
};

const BOTH: KeyEventAttempt = {
  dimensions: [...CORE_DIMENSIONS, GA4_FORM_ID_DIMENSION, GA4_PLACEMENT_DIMENSION],
  formIdKnown: true,
  hasPlacement: true,
};

const PLACEMENT_ONLY: KeyEventAttempt = {
  dimensions: [...CORE_DIMENSIONS, GA4_PLACEMENT_DIMENSION],
  formIdKnown: false,
  hasPlacement: true,
};

const FORM_ID_ONLY: KeyEventAttempt = {
  dimensions: [...CORE_DIMENSIONS, GA4_FORM_ID_DIMENSION],
  formIdKnown: true,
  hasPlacement: false,
};

const CORE_ONLY: KeyEventAttempt = {
  dimensions: [...CORE_DIMENSIONS],
  formIdKnown: false,
  hasPlacement: false,
};

/** First request. Retries are chosen from the error. */
export function firstKeyEventAttempt(): KeyEventAttempt {
  return BOTH;
}

/**
 * An unregistered custom dimension fails the whole report. Retry without the
 * dimension the error names, so a missing form_id does not drop placement and
 * a missing placement does not drop the form_id filter.
 */
export function keyEventRetryPlan(error: unknown): KeyEventAttempt[] {
  const message = error instanceof Error ? error.message : String(error);
  const formId = message.includes("form_id");
  const placement = message.includes("placement");
  if (formId && !placement) return [PLACEMENT_ONLY, CORE_ONLY];
  if (placement && !formId) return [FORM_ID_ONLY, CORE_ONLY];
  return [PLACEMENT_ONLY, FORM_ID_ONLY, CORE_ONLY];
}

export function dimensionIndex(attempt: KeyEventAttempt, name: string): number | null {
  const index = attempt.dimensions.indexOf(name);
  return index === -1 ? null : index;
}

/** A form_submit row counts only when form_id was sent. Other events always count. */
export function countsKeyEvent(
  eventKey: Ga4EventKey,
  formId: string | null,
  formIdKnown: boolean,
): boolean {
  if (eventKey !== "form_submission") return true;
  if (!formIdKnown) return true;
  const value = (formId ?? "").trim();
  return value.length > 0 && value.toLowerCase() !== "(not set)";
}

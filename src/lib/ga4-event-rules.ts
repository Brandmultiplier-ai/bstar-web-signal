/**
 * Gates for GA4 key events, keyed by the eventName GA4 sends.
 * An event with no entry is counted exactly as the report returns it.
 *
 * requiredDimensions are event parameters. The pull requests each one as
 * customEvent:<name>. A row counts only when every required value is present
 * and not empty or "(not set)".
 *
 * Adding a new event is one entry, for example:
 *   calendly_outbound_click: { requiredDimensions: ["placement"] },
 *   vsl_play: { requiredDimensions: ["video_id"] },
 */
export type Ga4EventRule = {
  requiredDimensions: string[];
  /** Why the gate exists. */
  comment?: string;
};

export const GA4_EVENT_RULES: Record<string, Ga4EventRule> = {
  form_submit: {
    requiredDimensions: ["form_id"],
    comment: "Drop form_submit hits that did not name which form fired.",
  },
};

/** Data API name for an event-scoped parameter. */
export function customEventDimension(parameter: string): string {
  return parameter.startsWith("customEvent:") ? parameter : `customEvent:${parameter}`;
}

export function parameterName(dimension: string): string {
  return dimension.startsWith("customEvent:") ? dimension.slice("customEvent:".length) : dimension;
}

/** Every custom dimension any rule needs, in stable order. */
export function requiredCustomDimensions(
  rules: Record<string, Ga4EventRule> = GA4_EVENT_RULES,
): string[] {
  const names: string[] = [];
  for (const rule of Object.values(rules)) {
    for (const parameter of rule.requiredDimensions) {
      const dimension = customEventDimension(parameter);
      if (!names.includes(dimension)) names.push(dimension);
    }
  }
  return names;
}

export function dimensionIsSet(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "(not set)";
}

export type GateDecision = "count" | "exclude" | "unfiltered";

/**
 * count: keep the row. exclude: a required dimension was empty.
 * unfiltered: a required dimension was not in the report, so the row is kept
 * and the pull must say the gate was not applied.
 */
export function gateEvent(
  eventName: string,
  values: Record<string, string | null | undefined>,
  availableDimensions: string[],
  rules: Record<string, Ga4EventRule> = GA4_EVENT_RULES,
): GateDecision {
  const rule = rules[eventName];
  if (!rule) return "count";

  const available = new Set(availableDimensions);
  const missing = rule.requiredDimensions.filter((parameter) => {
    return !available.has(customEventDimension(parameter)) && !available.has(parameter);
  });
  if (missing.length > 0) return "unfiltered";

  for (const parameter of rule.requiredDimensions) {
    if (!dimensionIsSet(values[parameter])) return "exclude";
  }
  return "count";
}

/** Events whose gate could not run, mapped to the parameters that were absent. */
export function unappliedGates(
  availableDimensions: string[],
  rules: Record<string, Ga4EventRule> = GA4_EVENT_RULES,
): Record<string, string[]> {
  const available = new Set(availableDimensions);
  const unapplied: Record<string, string[]> = {};
  for (const [eventName, rule] of Object.entries(rules)) {
    const missing = rule.requiredDimensions.filter((parameter) => {
      return !available.has(customEventDimension(parameter)) && !available.has(parameter);
    });
    if (missing.length > 0) unapplied[eventName] = missing;
  }
  return unapplied;
}

/** Text for the pull row and the GA4 coverage note. Null when nothing needs saying. */
export function gateNote(
  unapplied: Record<string, string[]>,
  excluded: Record<string, number>,
): string | null {
  const parts: string[] = [];
  for (const [eventName, parameters] of Object.entries(unapplied)) {
    parts.push(
      `${eventName} gate was not applied because ${parameters.join(", ")} is not registered in GA4, so those rows are unfiltered.`,
    );
  }
  const dropped = Object.entries(excluded).filter(([, count]) => count > 0);
  if (dropped.length > 0) {
    parts.push(
      `Excluded rows: ${dropped.map(([eventName, count]) => `${eventName} ${count}`).join(", ")}.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

import { GA4_PLACEMENT_DIMENSION } from "@/lib/sources";
import {
  GA4_EVENT_RULES,
  parameterName,
  requiredCustomDimensions,
  type Ga4EventRule,
} from "@/lib/ga4-event-rules";

const CORE_DIMENSIONS = ["date", "hostName", "eventName", "pagePath"] as const;

/**
 * date, host, event, page, then every custom dimension the rules table asks
 * for, then placement. A new rule adds its dimension here without a pull edit.
 */
export function keyEventDimensionList(
  rules: Record<string, Ga4EventRule> = GA4_EVENT_RULES,
): string[] {
  const dimensions = [...CORE_DIMENSIONS, ...requiredCustomDimensions(rules)];
  if (!dimensions.includes(GA4_PLACEMENT_DIMENSION)) dimensions.push(GA4_PLACEMENT_DIMENSION);
  return dimensions;
}

/**
 * Drop the custom dimensions an unregistered-field error names. If the error
 * names none, drop placement first so a rule dimension stays in the next try.
 * Returns null when nothing custom is left to remove.
 */
export function shrinkKeyEventDimensions(current: string[], error: unknown): string[] | null {
  const message = error instanceof Error ? error.message : String(error);
  const custom = current.filter((dimension) => dimension.startsWith("customEvent:"));
  if (custom.length === 0) return null;

  const named = custom.filter((dimension) => message.includes(parameterName(dimension)));
  let drop: string[];
  if (named.length > 0) drop = named;
  else if (custom.includes(GA4_PLACEMENT_DIMENSION)) drop = [GA4_PLACEMENT_DIMENSION];
  else drop = [custom[0]];

  const next = current.filter((dimension) => !drop.includes(dimension));
  return next.length === current.length ? null : next;
}

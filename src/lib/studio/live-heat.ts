/** Live-lens node heat — Operations Studio "Live" lens (PR #2 of docs/operations-studio/Full Code Base Upgrade). */

export type HeatLevel = 'idle' | 'active' | 'warm' | 'hot';

interface HeatInput {
  /** Items physically sitting at the node (active + blocked). */
  total: number;
  /** Items parked in error status. */
  error: number;
  /** Oldest item's age in hours, or null when the node is empty. */
  ageHours: number | null;
  /** The node's SLA in hours, or null when unset. */
  slaHours: number | null;
}

export interface NodeHeat {
  level: HeatLevel;
  /** Fraction of SLA the oldest item has consumed (0..∞), or null without age/SLA. */
  slaRatio: number | null;
  /** Human-readable why-it's-hot, for the node tooltip. */
  reasons: string[];
}

/** Oldest item past this fraction of its SLA tips a node from active → warm. */
export const WARM_SLA_RATIO = 0.75;

export function computeNodeHeat({ total, error, ageHours, slaHours }: HeatInput): NodeHeat {
  const reasons: string[] = [];
  const slaRatio =
    ageHours != null && slaHours != null && slaHours > 0 ? ageHours / slaHours : null;

  // Errors always need triage — hot even if nothing else is queued.
  if (error > 0) {
    reasons.push(`${error} in error`);
    return { level: 'hot', slaRatio, reasons };
  }
  if (total <= 0) {
    return { level: 'idle', slaRatio, reasons };
  }
  if (slaRatio != null && slaRatio >= 1) {
    reasons.push('over SLA');
    return { level: 'hot', slaRatio, reasons };
  }
  if (slaRatio != null && slaRatio >= WARM_SLA_RATIO) {
    reasons.push('approaching SLA');
    return { level: 'warm', slaRatio, reasons };
  }
  return { level: 'active', slaRatio, reasons };
}

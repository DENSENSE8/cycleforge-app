/** Kit-readiness — the single source of truth for "is the box matched?". */

import type { PackingEnforcement } from '@/lib/tenancy/settings';

export type { PackingEnforcement };

/** Minimal shape the verdict needs from a kit part. */
interface KitReadinessPart {
  id: number;
  critical: boolean;
}

interface KitReadiness {
  /** # of critical parts expected in the box. */
  requiredTotal: number;
  /** # of critical parts the packer has confirmed. */
  requiredConfirmed: number;
  /** ids of critical parts not yet confirmed. */
  missingRequiredIds: number[];
  /** True when every critical part is confirmed (or there are none). */
  allRequiredIn: boolean;
  /** Whether the pack should be hard-blocked given the enforcement mode. */
  blocked: boolean;
}

export function evaluateKitReadiness(
  parts: KitReadinessPart[],
  confirmedIds: Iterable<number>,
  enforcement: PackingEnforcement,
): KitReadiness {
  const confirmed = confirmedIds instanceof Set ? confirmedIds : new Set(confirmedIds);
  const critical = parts.filter((p) => p.critical);
  const missingRequiredIds = critical.filter((p) => !confirmed.has(p.id)).map((p) => p.id);
  const requiredTotal = critical.length;
  const requiredConfirmed = requiredTotal - missingRequiredIds.length;
  const allRequiredIn = missingRequiredIds.length === 0;
  // Graceful degradation: nothing expected ⇒ never blocks, whatever the mode.
  const blocked = enforcement === 'block_until_matched' && requiredTotal > 0 && !allRequiredIn;
  return { requiredTotal, requiredConfirmed, missingRequiredIds, allRequiredIn, blocked };
}

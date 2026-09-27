/**
 * Candidate ranking — exact > brand+model > keyword > fuzzy, the caller's
 * context first inside each tier, then score, recency, kind, id. Every key is
 * total, so equal inputs always come back in the same order.
 */

import { IDENTIFY_KINDS, type IdentifyKind, type IdentifyStage } from './schema';

export const IDENTIFY_TIERS = { exact: 0, brand: 1, keyword: 2, fuzzy: 3 } as const;
export type IdentifyTier = (typeof IDENTIFY_TIERS)[keyof typeof IDENTIFY_TIERS];

export interface RankKey {
  kind: IdentifyKind;
  entityId: number;
  tier: IdentifyTier;
  /** 2 = kind and stage match the context section, 1 = kind matches the page, 0 = outside. */
  contextLevel: 0 | 1 | 2;
  /** Within-tier strength (exact prior, fused RRF score, similarity). */
  score: number;
  /** Epoch ms of the record's last activity; null sorts last. */
  happenedAt: number | null;
}

export function compareCandidates(a: RankKey, b: RankKey): number {
  return (
    a.tier - b.tier ||
    b.contextLevel - a.contextLevel ||
    b.score - a.score ||
    (b.happenedAt ?? -Infinity) - (a.happenedAt ?? -Infinity) ||
    IDENTIFY_KINDS.indexOf(a.kind) - IDENTIFY_KINDS.indexOf(b.kind) ||
    a.entityId - b.entityId
  );
}

export interface IdentifyContextScope {
  kinds: readonly IdentifyKind[];
  stage: IdentifyStage | null;
}

export function contextLevel(
  scope: IdentifyContextScope | null,
  candidate: { kind: IdentifyKind; stage: IdentifyStage | null },
): 0 | 1 | 2 {
  if (!scope || !scope.kinds.includes(candidate.kind)) return 0;
  return scope.stage && scope.stage === candidate.stage ? 2 : 1;
}

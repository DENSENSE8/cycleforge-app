/** Pure channel disposition recommender — no DB, no I/O. */

import type {
  AllocationReason,
  ChannelDisposition,
  DispositionFacts,
  DispositionRecommendation,
} from './types';

const HIGH_VELOCITY = new Set(['A', 'B']);
const LOW_VELOCITY = new Set(['C', 'D']);

/** Score bands so sort is stable and reason-priority readable in the queue. */
const SCORE = {
  HOLD: 10_000,
  FBA_OOS_VELOCITY: 9_000,
  FBA_PLAN_OPEN: 8_000,
  PREBOX_FILLED: 5_000,
  PREBOX_LOW_VELOCITY: 4_500,
  DEFAULT_FBA: 3_000,
  DEFAULT_PREBOX: 2_000,
} as const;

export function recommendDisposition(facts: DispositionFacts): DispositionRecommendation {
  const reasons: AllocationReason[] = [];
  const defaultDisposition: Exclude<ChannelDisposition, 'HOLD'> =
    facts.defaultDisposition === 'FBA' ? 'FBA' : 'PREBOX_STOCK';

  if (facts.hold) {
    return { disposition: 'HOLD', reasons: ['OVERRIDE'], score: SCORE.HOLD };
  }

  const tier = facts.velocityTier ?? null;
  const openPlan = Math.max(0, Number(facts.openFbaPlanRemaining) || 0);
  const amazonOos = Boolean(facts.amazonOos);
  const highVelocity = tier != null && HIGH_VELOCITY.has(tier);
  const lowVelocity = tier != null && LOW_VELOCITY.has(tier);

  // 2 — OOS + popular → FBA
  if (amazonOos && highVelocity) {
    reasons.push('AMAZON_OOS', 'HIGH_VELOCITY');
    return { disposition: 'FBA', reasons, score: SCORE.FBA_OOS_VELOCITY + tierScoreBoost(tier) };
  }

  // Still surface OOS when velocity unknown (weaker FBA signal via plan/default paths)
  if (amazonOos) {
    reasons.push('AMAZON_OOS');
  }
  if (highVelocity) {
    reasons.push('HIGH_VELOCITY');
  }

  // 3 — open plan unfilled → FBA first
  if (openPlan > 0) {
    reasons.push('FBA_PLAN_OPEN');
    // Cap open-plan boost so huge plans don't dominate OOS+velocity band.
    const planBoost = Math.min(openPlan, 99);
    return {
      disposition: 'FBA',
      reasons: dedupe(reasons),
      score: SCORE.FBA_PLAN_OPEN + planBoost,
    };
  }

  // 4a — FBA already filled → stock
  if (facts.fbaFilled) {
    reasons.push('FBA_FILLED');
    return {
      disposition: 'PREBOX_STOCK',
      reasons: dedupe(reasons),
      score: SCORE.PREBOX_FILLED,
    };
  }

  // 4b — low velocity → stock
  if (lowVelocity) {
    reasons.push('LOW_VELOCITY');
    return {
      disposition: 'PREBOX_STOCK',
      reasons: dedupe(reasons),
      score: SCORE.PREBOX_LOW_VELOCITY,
    };
  }

  // 5 — default policy
  reasons.push('DEFAULT_POLICY');
  if (amazonOos && !reasons.includes('AMAZON_OOS')) {
    reasons.unshift('AMAZON_OOS');
  }
  // OOS without high velocity still prefers FBA over default stock when default is stock
  if (amazonOos) {
    return {
      disposition: 'FBA',
      reasons: dedupe([...reasons.filter((r) => r !== 'DEFAULT_POLICY'), 'AMAZON_OOS']),
      score: SCORE.DEFAULT_FBA + 100,
    };
  }

  return {
    disposition: defaultDisposition,
    reasons: dedupe(reasons),
    score: defaultDisposition === 'FBA' ? SCORE.DEFAULT_FBA : SCORE.DEFAULT_PREBOX,
  };
}

function tierScoreBoost(tier: string | null): number {
  if (tier === 'A') return 50;
  if (tier === 'B') return 25;
  return 0;
}

function dedupe(reasons: AllocationReason[]): AllocationReason[] {
  const seen = new Set<AllocationReason>();
  const out: AllocationReason[] = [];
  for (const r of reasons) {
    if (seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

/** Stable queue sort: score desc, then older tested-at first, then entity id. */
export function compareAllocationHits(
  a: { score: number; testedAt: string | null; entityId: number },
  b: { score: number; testedAt: string | null; entityId: number },
): number {
  if (b.score !== a.score) return b.score - a.score;
  const at = a.testedAt ? Date.parse(a.testedAt) : Number.POSITIVE_INFINITY;
  const bt = b.testedAt ? Date.parse(b.testedAt) : Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return a.entityId - b.entityId;
}

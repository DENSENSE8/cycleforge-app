/**
 * Arrival urgency tier — which urgency shelf a carton belongs on at the door.
 *
 * One vocabulary: the 0..3 tier of `receiving_carton.priority_tier`,
 * `inbound_order.priority_tier` and `InboundOrderDraft.priority`
 * (0 = most urgent; labels in {@link PRIORITY_OVERRIDE_TIERS}). Pure — the
 * placement route gathers the facts, this decides.
 *
 * Precedence (first hit wins):
 *   1. an explicit tier on the carton (manual pick, or a stock-out stamp);
 *   2. an explicit tier on the inbound order the carton's lines belong to
 *      (the most urgent one when the carton carries several orders);
 *   3. stock-out demand — a pending order needs a SKU in the box → tier 0;
 *   4. return / claim rules — a return or a carton with an open claim → tier 1
 *      (the triage lane ladder puts RETURN right after PO_STOCKOUT);
 *   5. the platform default ({@link ARRIVAL_PLATFORM_DEFAULT_TIERS});
 *   6. {@link ARRIVAL_FALLBACK_TIER}.
 */

import { priorityOverrideTier, PRIORITY_OVERRIDE_TIERS } from '@/lib/receiving/priority-override';

export type ArrivalTier = 0 | 1 | 2 | 3;

export type ArrivalTierSource =
  | 'carton'
  | 'inbound_order'
  | 'stockout'
  | 'return'
  | 'claim'
  | 'platform'
  | 'default';

/** The tier when nothing else speaks — "Medium". */
export const ARRIVAL_FALLBACK_TIER: ArrivalTier = 2;

/** The tier a return or claim carton is shelved at. */
const ARRIVAL_RETURN_CLAIM_TIER: ArrivalTier = 1;

/**
 * Platform → default arrival tier (rules as data). A platform missing here
 * falls through to {@link ARRIVAL_FALLBACK_TIER}. Goodwill buys are cheap
 * parts lots — they wait behind everything else.
 */
const ARRIVAL_PLATFORM_DEFAULT_TIERS: Readonly<Record<string, ArrivalTier>> = {
  goodwill: 3,
};

interface ArrivalTierFacts {
  /** `receiving_carton.priority_tier`. */
  cartonTier: number | null | undefined;
  /** `inbound_order.priority_tier` of every order the carton's lines belong to. */
  inboundOrderTiers?: ReadonlyArray<number | null | undefined>;
  /** A pending order needs a SKU in this carton (`findPendingOrderSkuMatches` non-empty) or `is_priority`. */
  stockoutDemand?: boolean;
  /** `receiving_carton.is_return` / intake type RETURN. */
  isReturn?: boolean;
  /** The carton has an open claim (filed ticket / exception code). */
  hasOpenClaim?: boolean;
  /** `receiving_carton.source_platform` (or the inbound order's platform). */
  sourcePlatform?: string | null;
}

export interface ArrivalTierResolution {
  tier: ArrivalTier;
  source: ArrivalTierSource;
}

/** A stored value as a tier, or null when it is not one of 0..3. */
export function asArrivalTier(value: unknown): ArrivalTier | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? (n as ArrivalTier) : null;
}

export function resolveArrivalTier(facts: ArrivalTierFacts): ArrivalTierResolution {
  const carton = asArrivalTier(facts.cartonTier);
  if (carton != null) return { tier: carton, source: 'carton' };

  let orderTier: ArrivalTier | null = null;
  for (const raw of facts.inboundOrderTiers ?? []) {
    const t = asArrivalTier(raw);
    if (t != null && (orderTier == null || t < orderTier)) orderTier = t;
  }
  if (orderTier != null) return { tier: orderTier, source: 'inbound_order' };

  if (facts.stockoutDemand) return { tier: 0, source: 'stockout' };
  if (facts.isReturn) return { tier: ARRIVAL_RETURN_CLAIM_TIER, source: 'return' };
  if (facts.hasOpenClaim) return { tier: ARRIVAL_RETURN_CLAIM_TIER, source: 'claim' };

  const platform = (facts.sourcePlatform ?? '').trim().toLowerCase();
  const platformTier = platform ? ARRIVAL_PLATFORM_DEFAULT_TIERS[platform] : undefined;
  if (platformTier != null) return { tier: platformTier, source: 'platform' };

  return { tier: ARRIVAL_FALLBACK_TIER, source: 'default' };
}

/** "Priority" / "High" / "Medium" / "Low" — the house tier label. */
export function arrivalTierLabel(tier: number): string {
  return priorityOverrideTier(tier)?.label ?? `Tier ${tier}`;
}

/** Why this tier, in a few words — the line under "Place on …". */
export function arrivalTierReason(source: ArrivalTierSource, platform?: string | null): string {
  switch (source) {
    case 'carton':
      return 'Set on the carton';
    case 'inbound_order':
      return 'Set on the purchase order';
    case 'stockout':
      return 'A pending order needs this';
    case 'return':
      return 'Return';
    case 'claim':
      return 'Open claim';
    case 'platform':
      return `${platform ? platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase() : 'Platform'} default`;
    case 'default':
      return 'Default';
  }
}

/** Every tier, most urgent first — the editor's option list. */
export const ARRIVAL_TIERS: readonly ArrivalTier[] = PRIORITY_OVERRIDE_TIERS.map(
  (t) => t.value as ArrivalTier,
);

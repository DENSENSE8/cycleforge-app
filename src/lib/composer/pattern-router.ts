/**
 * Pattern-based routing — classify a composer query onto a data source.
 *
 * Cycle Forge does not have separate eBay/Amazon tables. Platform is a derived
 * property on one orders corpus (`getOrderPlatformLabel` in order-platform.ts).
 * Routing filters/boosts the unified lookup; it does not fan out to marketplace
 * tables.
 */

import { isFbaOrder } from '@/utils/order-platform';
import type { ComposerTriggerKind } from './triggers';

export type ComposerSource = 'orders' | 'users' | 'actions';

export type MarketplacePlatform = 'ebay' | 'amazon' | 'walmart' | 'ecwid' | 'fba' | 'unknown';

export interface PatternRoute {
  readonly source: ComposerSource;
  readonly platform: MarketplacePlatform | null;
  /**
   * True when the token is a *complete* marketplace-shaped identifier, not a
   * prefix. Auto-commit is gated on this so `04-` cannot chip a unique prefix.
   */
  readonly complete: boolean;
  readonly token: string;
}

const AMAZON_COMPLETE = /^\d{3}-\d+-\d+$/;
const EBAY_COMPLETE = /^\d{2}-\d+-\d+$/;
const WALMART_COMPLETE = /^\d{15}$/;
const ECWID_COMPLETE = /^\d{4}$/;

/** Incomplete prefixes used only as a *hint* — never as auto-commit. */
const AMAZON_PREFIX = /^\d{3}-/;
const EBAY_PREFIX = /^\d{2}-/;

export function platformForOrderToken(token: string): MarketplacePlatform {
  const t = token.trim();
  if (!t) return 'unknown';
  if (isFbaOrder(t, null)) return 'fba';
  if (AMAZON_COMPLETE.test(t) || AMAZON_PREFIX.test(t)) return 'amazon';
  if (EBAY_COMPLETE.test(t) || EBAY_PREFIX.test(t)) return 'ebay';
  if (WALMART_COMPLETE.test(t)) return 'walmart';
  if (ECWID_COMPLETE.test(t)) return 'ecwid';
  return 'unknown';
}

export function isCompleteOrderIdentifier(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (isFbaOrder(t, null)) return true;
  return (
    AMAZON_COMPLETE.test(t) ||
    EBAY_COMPLETE.test(t) ||
    WALMART_COMPLETE.test(t) ||
    ECWID_COMPLETE.test(t)
  );
}

export function routeComposerQuery(kind: ComposerTriggerKind, query: string): PatternRoute {
  const token = query.trim();
  if (kind === 'user') {
    return { source: 'users', platform: null, complete: false, token };
  }
  if (kind === 'action') {
    return { source: 'actions', platform: null, complete: token.length > 0, token };
  }
  return {
    source: 'orders',
    platform: platformForOrderToken(token),
    complete: isCompleteOrderIdentifier(token),
    token,
  };
}

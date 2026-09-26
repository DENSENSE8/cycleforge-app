/** Which existing `orders` rows an incoming order IS, across account sources. */
import type { BackfillPolicy } from '@/lib/orders/order-row-backfill';

/** The account_source the pre-attribution ShipStation connector wrote. */
const AGGREGATOR_ACCOUNT_SOURCE = 'shipstation';

/** Compared trimmed + case-insensitively. */
export function isAggregatorSource(source: string | null | undefined): boolean {
  return String(source ?? '').trim().toLowerCase() === AGGREGATOR_ACCOUNT_SOURCE;
}

type OrderRowMatchKind = 'same' | 'adopt' | 'claim' | 'ambiguous' | 'none';

interface OrderRowMatch<R> {
  kind: OrderRowMatchKind;
  /** The rows the incoming order resolves to (empty for `ambiguous` / `none`). */
  rows: R[];
}

/** Maps an account_source to its platform (catalog slug), or null when the
 *  catalog cannot place it. */
export type PlatformOf = (accountSource: string | null | undefined) => string | null;

/**
 * Aggregator (ShipStation) order attributed to `incomingSource` against every
 * org row carrying its order number. `same` compares exactly as the writer's
 * per-source key does (trimmed, case-sensitive).
 */
export function matchAggregatorOrderRows<R extends { accountSource: string | null }>(
  incomingSource: string | null | undefined,
  rowsForOrderNumber: readonly R[],
  platformOf: PlatformOf,
): OrderRowMatch<R> {
  const incoming = String(incomingSource ?? '').trim();
  const same = rowsForOrderNumber.filter((r) => String(r.accountSource ?? '').trim() === incoming);
  if (incoming && same.length > 0) return { kind: 'same', rows: same };

  const legacy = rowsForOrderNumber.filter((r) => isAggregatorSource(r.accountSource));
  const marketplace = rowsForOrderNumber.filter((r) => !isAggregatorSource(r.accountSource));
  if (marketplace.length === 0) {
    return legacy.length > 0 ? { kind: 'claim', rows: legacy } : { kind: 'none', rows: [] };
  }
  if (legacy.length > 0) return { kind: 'ambiguous', rows: [] };

  // A blank source names no platform, so it cannot make the match ambiguous.
  const platforms = new Set<string>();
  for (const r of marketplace) {
    const source = String(r.accountSource ?? '').trim();
    if (!source) continue;
    platforms.add(platformOf(source) ?? `raw:${source.toLowerCase()}`);
  }
  return platforms.size > 1 ? { kind: 'ambiguous', rows: [] } : { kind: 'adopt', rows: marketplace };
}

/**
 * Marketplace lane (Square, Shopify, CSV) with no row under its own source:
 * claim a legacy `shipstation` row carrying its number, else nothing.
 */
export function matchMarketplaceOrderRows<R extends { accountSource: string | null }>(
  incomingSource: string | null | undefined,
  rowsForOrderNumber: readonly R[],
): OrderRowMatch<R> {
  const incoming = String(incomingSource ?? '').trim();
  const same = rowsForOrderNumber.filter((r) => String(r.accountSource ?? '').trim() === incoming);
  if (same.length > 0) return { kind: 'same', rows: same };
  if (incoming && !isAggregatorSource(incoming)) {
    const legacy = rowsForOrderNumber.filter((r) => isAggregatorSource(r.accountSource));
    if (legacy.length > 0) return { kind: 'claim', rows: legacy };
  }
  return { kind: 'none', rows: [] };
}

/** How the writer backfills rows matched across sources. */
export function crossSourceBackfillPolicy(
  kind: 'adopt' | 'claim',
  sourceTitleAuthoritative: boolean,
): Pick<BackfillPolicy, 'titleAuthoritative' | 'sourceWrite'> {
  return kind === 'adopt'
    ? { titleAuthoritative: false, sourceWrite: 'fill' }
    : { titleAuthoritative: sourceTitleAuthoritative, sourceWrite: 'rekey' };
}

/**
 * Should an update of `existingSource`'s row by `incomingSource` re-key it?
 * Only a legacy aggregator row taken over by a named source — never the
 * reverse, and never a marketplace row by another marketplace.
 */
export function shouldRekeyToIncomingSource(
  existingSource: string | null | undefined,
  incomingSource: string | null | undefined,
): boolean {
  return (
    isAggregatorSource(existingSource) &&
    !isAggregatorSource(incomingSource) &&
    String(incomingSource ?? '').trim() !== ''
  );
}

/** Collapse order for rows sharing an order id, keeper first: */
export function orderCollapseCandidates<R extends { accountSource: string | null }>(
  rows: readonly R[],
  score: (row: R) => number,
): R[] {
  return [...rows].sort(
    (a, b) =>
      Number(isAggregatorSource(a.accountSource)) - Number(isAggregatorSource(b.accountSource))
      || score(b) - score(a),
  );
}

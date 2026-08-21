/**
 * Standards identifiers for a `SearchHit`. Pure and client-safe.
 *
 * ## This is not a second search engine, and must not become one
 *
 * `hybridSearch` / `GET /api/global-search` remain the cross-entity
 * search — an AGENTS.md hard law that the word "interop" does not relax. The
 * interop projection IS the agent-legible graph; the only thing missing was a
 * way to name a record in terms a partner's system also understands. So this
 * decorates the hit the existing engine already returned, and there is
 * deliberately no lookup, no index, and no query surface here.
 *
 * The dependency direction is likewise deliberate: `SearchHitIdentifiers`
 * lives in `@/lib/search/search-hit` and this module imports it, never the
 * reverse. A `search-hit.ts` that imported interop would pull the CBV
 * vocabulary into every bundle that renders a search row.
 */

import type { SearchHit, SearchHitEntityType, SearchHitIdentifiers } from '@/lib/search/search-hit';
import {
  gtinIdentifier,
  internalIdentifier,
  sgtinIdentifier,
  type InternalEntityKind,
} from './gs1-keys';

/**
 * Which internal entity kind each search entity maps to.
 *
 * Total over the union, so a seventh searchable entity is a compile error here
 * until someone decides how a partner should name it.
 */
const KIND_BY_ENTITY: Record<SearchHitEntityType, InternalEntityKind> = {
  order: 'order',
  unit: 'unit',
  receiving: 'carton',
  sku: 'sku',
  // A repair ticket and an FBA shipment are both work containers rather than
  // trade items. Neither has a GS1 key of its own, so both stay internal.
  repair: 'order',
  fba: 'shipment',
};

/**
 * Build the identifiers block for a hit.
 *
 * `internal` is always produced. `gs1` appears only when the caller supplies
 * the facts a real key needs — a GTIN for a SKU, a GTIN AND a serial for a
 * unit. Nothing is inferred: a `unit` hit with no GTIN gets no `gs1`, because
 * a serial alone is not an SGTIN.
 */
export function searchHitIdentifiers(
  hit: Pick<SearchHit, 'id' | 'entityType'>,
  facts?: { gtin?: string | null; serial?: string | null },
): SearchHitIdentifiers {
  const kind = KIND_BY_ENTITY[hit.entityType];
  const identifiers: SearchHitIdentifiers = {
    internal: internalIdentifier(kind, hit.id).uri,
  };

  if (!facts) return identifiers;

  if (hit.entityType === 'unit') {
    const sgtin = sgtinIdentifier(facts.gtin, facts.serial);
    if (sgtin) identifiers.gs1 = sgtin.uri;
    return identifiers;
  }

  if (hit.entityType === 'sku') {
    const gtin = gtinIdentifier(facts.gtin);
    if (gtin) identifiers.gs1 = gtin.uri;
  }

  return identifiers;
}

/** Non-mutating decorator — returns a new hit carrying its identifiers. */
export function withSearchHitIdentifiers(
  hit: SearchHit,
  facts?: { gtin?: string | null; serial?: string | null },
): SearchHit {
  return { ...hit, identifiers: searchHitIdentifiers(hit, facts) };
}

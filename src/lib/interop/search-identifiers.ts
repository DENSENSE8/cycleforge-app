/** Standards identifiers for a `SearchHit`. */

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
 * Total over the union, so a tenth searchable entity is a compile error here
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
  // Customer-service records get their own internal kinds rather than
  // borrowing `order`: the id in the URN is a claim id / a ticket id, and a
  // partner resolving it as an order number would be resolving a lie.
  warranty: 'claim',
  ticket: 'ticket',
  // A bin is a PLACE, not a trade item or a logistic unit.
  location: 'location',
};

/** Build the identifiers block for a hit. */
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

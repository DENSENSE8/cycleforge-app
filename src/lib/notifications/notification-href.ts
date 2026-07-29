/**
 * Deep link for an inbox row.
 *
 * Composes the cross-entity link SoT (`searchHitHref`, src/lib/search/search-hit.ts)
 * rather than re-deriving per-surface routes — a second href map is exactly the
 * drift the search waist exists to prevent. Only the two entity types the
 * search vocabulary does not carry are resolved locally, and they are marked.
 *
 * Pure + dependency-free so the client Inbox can import it (bundle altitude).
 */

import { searchHitHref } from '@/lib/search/search-hit';
import type { NotifiableEntityType } from './event-vocabulary';

export function notificationHref(entityType: string, entityId: number): string {
  switch (entityType as NotifiableEntityType) {
    case 'order':
      return searchHitHref('ORDER', entityId);
    case 'serial_unit':
      return searchHitHref('SERIAL_UNIT', entityId);
    case 'receiving':
      return searchHitHref('RECEIVING', entityId);
    case 'repair':
      return searchHitHref('REPAIR', entityId);
    case 'fba_shipment':
      return searchHitHref('FBA_SHIPMENT', entityId);
    // Not in SearchEntityType — a receiving LINE opens its carton's workspace
    // with the line preselected (Unbox is the first-class receiving surface).
    case 'receiving_line':
      return `/unbox?openLineId=${entityId}`;
    // Warranty claims live behind the shipping workspace's warranty mode.
    case 'warranty_claim':
      return `/shipping?mode=warranty&claim=${entityId}`;
    default:
      return '/';
  }
}

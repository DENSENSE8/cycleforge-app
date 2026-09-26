/** Deep link for an inbox row. */

import { searchHitHref } from '@/lib/search/search-hit';
import type { InboxEntityType } from './event-vocabulary';

export function notificationHref(entityType: string, entityId: number): string {
  switch (entityType as InboxEntityType) {
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
    // `?ticket=` takes `support_tickets.id` — `resolveSupportContext` probes the PK first and the provider id second, so the LOCAL id an inbox…
    case 'support_ticket':
      return searchHitHref('SUPPORT_TICKET', entityId);
    // Not in SearchEntityType — a receiving LINE opens its carton's workspace
    // with the line preselected (Unbox is the first-class receiving surface).
    case 'receiving_line':
      return `/unbox?openLineId=${entityId}`;
    // Warranty claims live behind the shipping workspace's warranty mode.
    case 'warranty_claim':
      return `/shipping?mode=warranty&claim=${entityId}`;
    // A standalone task has no record: its inbox row opens the task itself.
    case 'task':
      return `/?task=${entityId}`;
    default:
      return '/';
  }
}

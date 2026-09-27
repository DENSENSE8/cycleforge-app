/**
 * Hrefs for `nav_recents` rows — built from (surface, entity_type, entity_id)
 * on read, never stored, so a moved route re-points every old recent at once.
 * Record kinds go through Identify's `recordHref` (the one kind → page map);
 * surface-specific targets (a serial's journey, the labels history pane, a
 * detail-stack inspector) are spelled here next to the surface that owns them.
 */

import { recordHref } from '@/lib/identify/record-href';
import type { SearchHitEntityType } from '@/lib/search/search-hit';
import { shippingOrdersHref } from '@/lib/shipping/orders-desk';
import { cartonReadHref } from '@/lib/receiving/surface-path';
import { buildSerialJourneyHref } from '@/lib/serial/serial-journey';

const POSITIVE_INT = /^[1-9][0-9]*$/;

/** Entity types whose id is a table primary key (positive integer). */
const NUMERIC_ID_TYPES: Record<string, true> = {
  order: true, unit: true, receiving: true, sku: true, repair: true,
  fba: true, warranty: true, ticket: true, location: true, shipment: true,
};

/** Same-origin app path: one leading slash, no scheme-relative `//`, no whitespace or backslash. */
function isAppPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !/[\s\\]/.test(value);
}

/**
 * Whether `entityId` is a well-formed id for `entityType` on `surface` — the
 * write-side guard, so every stored row can be turned back into a link on read.
 * A labels lookup key is a unit id OR a serial; a trace is a serial number.
 */
export function isValidNavRecentEntityId(surface: string, entityType: string, entityId: string): boolean {
  if (entityType === 'page') return isAppPath(entityId);
  if (surface === 'labels.lookups' || surface === 'audit_log.trace') return entityId.length > 0;
  if (NUMERIC_ID_TYPES[entityType]) return POSITIVE_INT.test(entityId);
  return false;
}

/** The link a stored recent opens. Assumes the row passed `isValidNavRecentEntityId` on write. */
export function navRecentStoreHref(surface: string, entityType: string, entityId: string): string {
  switch (surface) {
    case 'detail_stacks':
      if (entityType === 'order') return shippingOrdersHref({ openOrderId: Number(entityId) });
      if (entityType === 'receiving') return cartonReadHref(Number(entityId));
      return `/fba?openShipmentId=${encodeURIComponent(entityId)}`;
    case 'audit_log.trace':
      return buildSerialJourneyHref(entityId);
    case 'labels.lookups':
      return `/products?${new URLSearchParams({ view: 'labels', labelsView: 'history', historyId: entityId })}`;
    default:
      if (entityType === 'page') return entityId;
      return recordHref({ kind: entityType as SearchHitEntityType, entityId });
  }
}

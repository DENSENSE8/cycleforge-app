/**
 * Where a record opens: page + sidebar context + record param. An order that
 * sits in a desk view opens ON that view with the view's own `recordParam`
 * (`DESK_VIEWS`; Shipped opens a package, `?shipment=`), so the sidebar lights
 * the right section; everything else opens where search already sends it.
 */

import { deskViewHref, getDeskView, type DeskViewId } from '@/lib/outbound/desk-views';
import { searchHitHref, toDbEntityType } from '@/lib/search/search-hit';
import { SHIPMENT_RECORD_PARAM } from '@/lib/shipments/shipment-record-types';
import type { IdentifyKind } from './schema';

export function recordHref(record: {
  kind: IdentifyKind;
  entityId: number | string;
  /** The desk view the order is in, when identify derived one. */
  deskView?: DeskViewId | null;
  /** `orders.shipment_id` — the Shipped desk opens a package, not an order row. */
  shipmentId?: number | string | null;
}): string {
  const id = Number(record.entityId);
  if (record.kind === 'order' && record.deskView) {
    const base = deskViewHref(record.deskView);
    const [pathname, search = ''] = base.split('?');
    const params = new URLSearchParams(search);
    const shipmentId = Number(record.shipmentId);
    if (record.deskView === 'shipped' && Number.isSafeInteger(shipmentId) && shipmentId > 0) {
      params.set(SHIPMENT_RECORD_PARAM, String(shipmentId));
    } else {
      params.set(getDeskView(record.deskView).recordParam, String(id));
    }
    return `${pathname}?${params.toString()}`;
  }
  return searchHitHref(toDbEntityType(record.kind), id);
}

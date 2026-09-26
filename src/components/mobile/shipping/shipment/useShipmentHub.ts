'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import { useShipmentRecord } from '@/lib/shipments/shipment-record-client';

/** Where a package hub's Back lands when it was not opened from a job. */
export const SHIPMENT_HUB_PARENT = '/m/shipping/history';

/** `/m/shipping/shipments/<id>` — the package hub for one `shipping_tracking_numbers.id`. */
export function shipmentHubHref(shipmentId: number): string {
  return `/m/shipping/shipments/${shipmentId}`;
}

/**
 * The package record shared by the hub and every door screen through
 * `useShipmentRecord` (one key, `shipmentRecordKey`), so hub ↔ door is a cache
 * hit. `back` is the job the package was opened from (`?back=`, e.g. `/m/scan`);
 * `link()` carries it onto `/info` and door hrefs so the X still returns there.
 */
export function useShipmentHub() {
  const params = useParams<{ shipmentId: string }>();
  const searchParams = useSearchParams();
  const param = params?.shipmentId ? decodeURIComponent(params.shipmentId).trim() : '';
  const shipmentId = /^\d+$/.test(param) ? Number(param) : null;
  const back = mobileJobReturn(searchParams?.get('back'));
  const record = useShipmentRecord(shipmentId);
  const base = shipmentHubHref(shipmentId ?? 0);
  const link = (href: string) => (back ? withJobReturn(href, back) : href);

  return {
    param,
    shipmentId,
    base,
    back,
    link,
    data: record.data ?? null,
    loading: shipmentId != null && record.isPending,
    error:
      shipmentId == null
        ? `No package ${param || 'id'}.`
        : record.error instanceof Error
          ? record.error.message
          : null,
    reload: () => void record.refetch(),
  };
}

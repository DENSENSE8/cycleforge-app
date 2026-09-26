'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/Icons';
import { shipmentHubHref, useShipmentHub } from '@/components/mobile/shipping/shipment/useShipmentHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * `/m/shipping/shipments/[shipmentId]/boxes` — the other packages on the same
 * order(s) (`shipment_links` siblings); each row opens that box's own hub.
 */
function ShipmentBoxesInner() {
  const hub = useShipmentHub();
  return (
    <DetailRecordFrame<ShipmentRecord>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.tracking ?? hub.param,
        mono: true,
        subtitle: 'Other boxes',
        backHref: hub.link(hub.base),
        meta: (d) => (d.box ? `This is box ${d.box.seq ?? '?'} of ${d.box.total}` : undefined),
      }}
    >
      {(d) => (
        <div className="flex-1 divide-y divide-mode-rule">
          {d.siblings.length > 0 ? (
            <ol aria-label={`Other boxes with ${d.tracking}`} className="bg-mode-panel">
              {d.siblings.map((box) => (
                <li key={box.shipmentId} className="border-b border-mode-rule last:border-b-0">
                  <Link
                    href={hub.link(shipmentHubHref(box.shipmentId))}
                    className="group flex min-h-mode-hit items-center gap-3 px-mode-page py-3 active:bg-mode-ink"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-mode-body font-semibold text-mode-ink group-active:text-mode-panel">{box.tracking}</span>
                      <span className="block truncate text-role-caption text-mode-muted group-active:text-mode-panel">
                        {[
                          box.boxSeq != null ? `Box ${box.boxSeq}${box.isPrimary ? ' (primary)' : ''}` : box.isPrimary ? 'Primary box' : null,
                          box.packedAt
                            ? `Packed${box.packerName ? ` by ${box.packerName}` : ''} ${formatMonthDayTimePST(box.packedAt)}`
                            : 'Never pack-scanned',
                          box.shippedAt ? `Shipped ${formatMonthDayTimePST(box.shippedAt)}` : 'Not scanned out',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-mode-muted group-active:text-mode-panel" />
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">The only box on its order.</p>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function ShipmentBoxesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <ShipmentBoxesInner />
    </Suspense>
  );
}

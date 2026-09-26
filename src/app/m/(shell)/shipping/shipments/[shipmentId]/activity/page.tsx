'use client';

import { Suspense } from 'react';
import { useShipmentHub } from '@/components/mobile/shipping/shipment/useShipmentHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { plural } from '@/lib/orders/order-hub';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { formatDateTimePST } from '@/utils/date';

/**
 * `/m/shipping/shipments/[shipmentId]/activity` — every action any station,
 * person or carrier took on the package, newest first (server order), read-only.
 */
function ShipmentActivityInner() {
  const hub = useShipmentHub();
  return (
    <DetailRecordFrame<ShipmentRecord>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.tracking ?? hub.param,
        mono: true,
        subtitle: 'Activity',
        backHref: hub.link(hub.base),
        meta: (d) => plural(d.actions.length, 'action'),
      }}
    >
      {(d) => (
        <div className="flex-1 divide-y divide-mode-rule">
          {d.actions.length > 0 ? (
            <ol aria-label={`Activity on ${d.tracking}`} className="bg-mode-panel">
              {d.actions.map((action) => (
                <li key={action.id} className="border-b border-mode-rule px-mode-page py-3 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-mode-body font-semibold text-mode-ink">{action.label}</p>
                    <time dateTime={action.at} className="shrink-0 text-role-caption tabular-nums text-mode-muted">
                      {formatDateTimePST(action.at)}
                    </time>
                  </div>
                  <p className="mt-0.5 text-role-caption text-mode-muted">
                    {[action.actorName ?? (action.source === 'carrier' ? d.carrier ?? 'Carrier' : 'Unassigned'), action.station]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {action.detail ? <p className="mt-0.5 break-words text-role-caption text-mode-ink">{action.detail}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Nothing recorded on this package yet.</p>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function ShipmentActivityPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <ShipmentActivityInner />
    </Suspense>
  );
}

'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useShipmentHub } from '@/components/mobile/shipping/shipment/useShipmentHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { isEmptyMetaDash, orderRowConditionLabel } from '@/lib/conditions';
import { plural } from '@/lib/orders/order-hub';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * `/m/shipping/shipments/[shipmentId]/items` — every order line in the box,
 * read-only: title (SKU identity law, server-resolved), SKU, qty, condition,
 * the serials that went out with it, and the order it belongs to (→ order hub).
 */
function ShipmentItemsInner() {
  const hub = useShipmentHub();
  return (
    <DetailRecordFrame<ShipmentRecord>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.tracking ?? hub.param,
        mono: true,
        subtitle: 'Items',
        backHref: hub.link(hub.base),
        meta: (d) => plural(d.items.length, 'order line'),
      }}
    >
      {(d) => (
        <div className="flex-1 divide-y divide-mode-rule">
          {d.items.length > 0 ? (
            <ol aria-label={`Items in ${d.tracking}`} className="bg-mode-panel">
              {d.items.map((item) => {
                const condition = orderRowConditionLabel(item.condition);
                const facts = [
                  `Qty ${Number(item.quantity) || 1}`,
                  isEmptyMetaDash(condition) ? null : condition,
                  item.channel,
                  item.orderStatus ? item.orderStatus.replace(/_/g, ' ').toLowerCase() : null,
                ].filter(Boolean);
                return (
                  <li key={item.orderRowId} className="border-b border-mode-rule px-mode-page py-3 last:border-b-0">
                    <p className="text-mode-body font-semibold text-mode-ink">{item.title}</p>
                    <p className="mt-0.5 font-mono text-role-caption text-mode-muted">{item.sku ?? 'No SKU'}</p>
                    <p className="mt-0.5 text-role-caption text-mode-muted">{facts.join(' · ')}</p>
                    {item.serials.length > 0 ? (
                      <ul aria-label="Serials" className="mt-1.5 space-y-0.5">
                        {item.serials.map((serial) => (
                          <li key={serial.serial} className="text-role-caption text-mode-muted">
                            <span className="font-mono text-mode-ink">{serial.serial}</span>
                            {serial.testedByName || serial.testedAt
                              ? ` · tested${serial.testedByName ? ` by ${serial.testedByName}` : ''}${serial.testedAt ? ` ${formatMonthDayTimePST(serial.testedAt)}` : ''}`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-role-caption text-mode-muted">No serials recorded</p>
                    )}
                    <Link
                      href={`/m/orders/${item.orderRowId}?by=id`}
                      className="mt-1.5 inline-flex min-h-mode-hit items-center font-mono text-role-caption font-semibold text-text-info underline-offset-2 active:underline"
                    >
                      Order {item.orderRef ?? `#${item.orderRowId}`}
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">No order lines on this package.</p>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function ShipmentItemsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <ShipmentItemsInner />
    </Suspense>
  );
}

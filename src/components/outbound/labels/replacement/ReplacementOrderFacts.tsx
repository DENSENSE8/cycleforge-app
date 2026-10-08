'use client';

/**
 * What the replacement ships against: the order's labels so far (the first
 * label + any earlier replacement) and the ship-to, editable in place through
 * the order record's own {@link OrderShipToEditor} (it persists to the order;
 * the host refetches the label summary on the save signal).
 */

import { useState } from 'react';
import { Pencil } from '@/components/Icons';
import { TrackingChip } from '@/components/ui/CopyChip';
import { OrderShipToEditor } from '@/components/outbound/orders/order-record-sections';
import { Button } from '@/design-system/primitives';
import type { CustomerRecord } from '@/lib/customers/customer-display';
import { formatMoney } from '@/lib/shipping/label-rate-choice';
import { LABEL_PURPOSE_FACE } from '@/lib/shipping/label-purpose';
import type { OrderLabelEntry } from '@/lib/shipping/order-label-links';
import type { ShipAddress } from '@/lib/shipping/shipstation/types';

export function ReplacementOrderFacts({
  orderId,
  labels,
  currentTracking,
  shipTo,
}: {
  orderId: number;
  labels: readonly OrderLabelEntry[];
  /** The order's shipped tracking — the "first label" when the ledger holds none (an imported label). */
  currentTracking: string | null;
  shipTo: ShipAddress | null;
}) {
  const [editing, setEditing] = useState(false);
  const address = shipTo
    ? [
        shipTo.name,
        shipTo.company ?? null,
        shipTo.addressLine1,
        shipTo.addressLine2 ?? null,
        `${shipTo.cityLocality}, ${shipTo.stateProvince} ${shipTo.postalCode}`,
      ].filter((line): line is string => Boolean(line && line.trim()))
    : [];
  // The editor reads the book's buyer shape; the label summary's ship-to is the address labels buy to.
  const customer: CustomerRecord | null = shipTo
    ? {
        id: 0,
        display_name: shipTo.name || null,
        customer_name: shipTo.company ?? null,
        first_name: null,
        last_name: null,
        email: null,
        phone: shipTo.phone ?? null,
        mobile: null,
        shipping_address_1: shipTo.addressLine1,
        shipping_address_2: shipTo.addressLine2 ?? null,
        shipping_city: shipTo.cityLocality,
        shipping_state: shipTo.stateProvince,
        shipping_postal_code: shipTo.postalCode,
        shipping_country: shipTo.countryCode,
        billing_address: null,
      }
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="flex flex-col gap-1" aria-label="Labels on this order" data-testid="send-replacement-current-labels">
        <h3 className="mode-label text-text-muted">Labels on this order</h3>
        {labels.length === 0 ? (
          currentTracking ? (
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <span className="shrink-0 rounded-mode-control bg-surface-sunken px-1.5 py-0.5 text-role-caption text-text-muted">First label</span>
              <TrackingChip value={currentTracking} display={currentTracking} />
            </p>
          ) : (
            <p className="text-role-caption text-text-faint">No label on file yet.</p>
          )
        ) : (
          <ul className="flex flex-col gap-1">
            {labels.map((label) => (
              <li key={label.id} className="flex min-w-0 items-center gap-2 text-sm">
                <span className="shrink-0 rounded-mode-control bg-surface-sunken px-1.5 py-0.5 text-role-caption text-text-muted">
                  {label.purpose === 'outbound' ? 'First label' : LABEL_PURPOSE_FACE[label.purpose].code}
                </span>
                <span className="shrink-0 text-text-soft">{label.carrierCode ?? '—'}</span>
                {label.trackingNumber ? <TrackingChip value={label.trackingNumber} display={label.trackingNumber} carrierHint={label.carrierCode} /> : null}
                {label.cost != null && label.currency ? (
                  <span className="ml-auto shrink-0 text-role-caption tabular-nums text-text-muted">
                    {formatMoney(label.cost, label.currency)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1" aria-label="Ship to" data-testid="send-replacement-ship-to">
        <div className="flex items-center justify-between gap-2">
          <h3 className="mode-label text-text-muted">Ship to</h3>
          <Button
            variant="ghost"
            size="sm"
            icon={editing ? undefined : <Pencil />}
            onClick={() => setEditing((open) => !open)}
            data-testid="send-replacement-ship-to-edit"
          >
            {editing ? 'Done' : 'Edit'}
          </Button>
        </div>
        {editing ? (
          <OrderShipToEditor key={orderId} orderId={orderId} customer={customer} />
        ) : address.length > 0 ? (
          <div className="rounded-mode-control bg-surface-sunken px-3 py-2 text-sm">
            {address.map((line) => (
              <p key={line} className="min-w-0 truncate text-text-default">{line}</p>
            ))}
          </div>
        ) : (
          <p className="text-role-caption text-text-faint">No stored ship-to — Edit adds the buyer&rsquo;s address.</p>
        )}
      </section>
    </div>
  );
}

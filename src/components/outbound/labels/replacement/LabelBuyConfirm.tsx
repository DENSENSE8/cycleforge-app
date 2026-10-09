'use client';

/**
 * The label-buy Confirm step: the one rate about to be bought — total,
 * carrier and service, arrival — the parcel, the ship-to it prints for, and the
 * replacement reason. Confirm & buy is the footer verb.
 */

import type { ReactNode } from 'react';
import { Truck } from '@/components/Icons';
import { formatMoney } from '@/lib/shipping/label-rate-choice';
import { ozToLbText, rateArrival, rateTotal } from '@/lib/shipping/replacement-rate-shop';
import type { ShipAddress, ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { formatDateKeyMedium } from '@/utils/date';

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="mode-label text-text-muted">{term}</dt>
      <dd className="min-w-0 text-sm text-text-default">{children}</dd>
    </div>
  );
}

export function LabelBuyConfirm({
  rate,
  noun,
  orderRef,
  parcel,
  insuredValue,
  shipTo,
  reasonLabel,
  note,
}: {
  rate: ShippingRateOption;
  /** "label" (the order's first) or "replacement label". */
  noun: string;
  orderRef: string;
  parcel: { weightOz: number; length: number; width: number; height: number };
  /** The declared value sent with the quote, already formatted; null when uninsured. */
  insuredValue: string | null;
  shipTo: ShipAddress | null;
  reasonLabel: string | null;
  note: string;
}) {
  const arrival = rateArrival(rate, new Date());
  return (
    <div className="flex flex-col gap-4" data-testid="label-buy-confirm">
      <div className="flex items-center gap-3 rounded-mode-control border border-border-accent bg-surface-accent px-4 py-3">
        <Truck className="h-5 w-5 shrink-0 text-text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-default">{rate.carrierName}</p>
          <p className="truncate text-role-caption text-text-soft">{rate.serviceName}</p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums text-text-default" data-testid="label-buy-confirm-total">
          {formatMoney(rateTotal(rate), rate.currency)}
        </p>
      </div>
      <p className="text-role-caption text-text-soft">
        Buys this {noun} for {orderRef} and links it to the order.
      </p>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact term="Arrives">{arrival ? formatDateKeyMedium(arrival) : 'Carrier gives no date'}</Fact>
        <Fact term="Parcel">
          {parcel.weightOz} oz ({ozToLbText(parcel.weightOz)}) · {parcel.length} × {parcel.width} × {parcel.height} in
        </Fact>
        <Fact term="Insurance">{insuredValue ? `Declared ${insuredValue}` : 'Not insured'}</Fact>
        <Fact term="Ship to">
          {shipTo ? (
            <>
              <span className="block truncate">{shipTo.name}</span>
              <span className="block truncate text-text-soft">
                {shipTo.addressLine1}
                {shipTo.addressLine2 ? `, ${shipTo.addressLine2}` : ''}
              </span>
              <span className="block truncate text-text-soft">
                {shipTo.cityLocality}, {shipTo.stateProvince} {shipTo.postalCode}
              </span>
            </>
          ) : (
            '—'
          )}
        </Fact>
        {reasonLabel ? (
          <Fact term="Reason">
            {reasonLabel}
            {note.trim() ? <span className="block text-text-soft">{note.trim()}</span> : null}
          </Fact>
        ) : null}
      </dl>
    </div>
  );
}

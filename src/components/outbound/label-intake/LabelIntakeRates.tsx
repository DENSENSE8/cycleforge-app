'use client';

import { Check } from '@/components/Icons';
import { evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { displayCarrierFromHint } from '@/lib/carrier-brand';
import { LABEL_PURPOSE_FACE } from '@/lib/shipping/label-purpose';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { cn } from '@/utils/_cn';
import { formatMoney, type IntakePurchase, type IntakePurpose } from './label-intake-client';

function eta(rate: ShippingRateOption): string {
  if (typeof rate.deliveryDays === 'number' && rate.deliveryDays > 0) {
    return `${rate.deliveryDays}d`;
  }
  if (rate.estimatedDeliveryDate) {
    const d = new Date(rate.estimatedDeliveryDate);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return '—';
}

/**
 * The rate ledger: fixed columns — carrier · service · package · ETA · price —
 * one row per option, cheapest first. A row is a radio; the selected row
 * takes the ink fill.
 */
export function LabelIntakeRateLedger({
  rates,
  selectedRateId,
  onSelect,
  invalidCount,
}: {
  rates: readonly ShippingRateOption[];
  selectedRateId: string | null;
  onSelect: (rateId: string) => void;
  invalidCount: number;
}) {
  if (rates.length === 0) {
    return <p className="text-role-data text-mode-warn">No carrier returned a rate for this parcel.</p>;
  }
  return (
    <div>
      <div
        className={cn(RECORD_LABEL_CLASS, 'flex border-b border-mode-ink text-mode-muted')}
        aria-hidden
      >
        <span className="w-24 shrink-0 px-2 py-1">Carrier</span>
        <span className="min-w-0 flex-1 px-2 py-1">Service</span>
        <span className="w-28 shrink-0 px-2 py-1">Package</span>
        <span className="w-16 shrink-0 px-2 py-1 text-right">ETA</span>
        <span className="w-24 shrink-0 px-2 py-1 text-right">Price</span>
      </div>
      <div role="radiogroup" aria-label="Rates" className="max-h-72 overflow-y-auto" data-testid="label-intake-rates">
        {rates.map((rate) => {
          const selected = rate.rateId === selectedRateId;
          return (
            <button
              key={rate.rateId}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(rate.rateId)}
              className={cn(
                'ds-raw-button flex w-full items-center border-b border-mode-rule text-left text-role-data min-h-mode-hit',
                focusRing('cell'),
                selected ? 'bg-mode-ink text-mode-bar' : 'text-mode-ink hover:bg-mode-hover',
              )}
            >
              <span className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 truncate px-2')}>{rate.carrierName}</span>
              <span className="min-w-0 flex-1 truncate px-2">{rate.serviceName}</span>
              <span className="w-28 shrink-0 truncate px-2 text-role-micro">{rate.packageType?.replaceAll('_', ' ') ?? '—'}</span>
              <span className="w-16 shrink-0 px-2 text-right tabular-nums">{eta(rate)}</span>
              <span className={cn(RECORD_ID_CLASS, 'w-24 shrink-0 px-2 text-right')}>
                {formatMoney(rate.amount, rate.currency)}
              </span>
            </button>
          );
        })}
      </div>
      {invalidCount > 0 ? (
        <p className="mt-1 text-role-micro text-mode-muted">
          {invalidCount} carrier service{invalidCount === 1 ? '' : 's'} could not rate this parcel.
        </p>
      ) : null}
    </div>
  );
}

/** Buy → confirm → bought, in place. The charge only fires from the confirm step. */
export function LabelIntakeBuyBar({
  purpose,
  orderRef,
  rate,
  confirming,
  onConfirming,
  onBuy,
  buying,
  error,
  bought,
  onPrint,
  onNext,
}: {
  purpose: IntakePurpose;
  orderRef: string;
  rate: ShippingRateOption | null;
  confirming: boolean;
  onConfirming: (next: boolean) => void;
  onBuy: () => void;
  buying: boolean;
  error: string | null;
  bought: IntakePurchase | null;
  onPrint: (() => void) | null;
  /** The other purpose, offered once this one is bought. */
  onNext: { label: string; run: () => void } | null;
}) {
  const noun = LABEL_PURPOSE_FACE[purpose].label.toLowerCase();

  if (bought) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="label-intake-bought">
        <span className={cn(RECORD_LABEL_CLASS, 'inline-flex items-center gap-1 text-mode-ink')}>
          <Check className="h-3.5 w-3.5" aria-hidden />
          {bought.idempotent ? 'Already bought' : 'Bought'} · {LABEL_PURPOSE_FACE[purpose].code}
        </span>
        <span className={cn(RECORD_ID_CLASS, 'select-all')}>{bought.tracking ?? '—'}</span>
        <span className="text-role-data text-mode-muted">
          {[displayCarrierFromHint(bought.carrier) ?? bought.carrier, formatMoney(bought.cost, bought.currency)].filter(Boolean).join(' · ')}
        </span>
        <span className="ml-auto flex gap-2">
          {onPrint ? (
            <button type="button" className={evidenceVerbClass(true)} onClick={onPrint}>
              Print label
            </button>
          ) : null}
          {onNext ? (
            <button type="button" className={evidenceVerbClass()} onClick={onNext.run}>
              {onNext.label}
            </button>
          ) : null}
        </span>
      </div>
    );
  }

  if (!rate) {
    return <p className="text-role-data text-mode-muted">Pick a rate to buy the {noun} label.</p>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className={cn(evidenceVerbClass(true), 'w-full')}
        onClick={() => onConfirming(true)}
        data-testid="label-intake-buy"
      >
        Buy {formatMoney(rate.amount, rate.currency)} {noun} label
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="label-intake-confirm">
      <p className="text-role-data text-mode-ink">
        Charge <span className={RECORD_ID_CLASS}>{formatMoney(rate.amount, rate.currency)}</span> for a{' '}
        {rate.serviceName.startsWith(rate.carrierName) ? rate.serviceName : `${rate.carrierName} ${rate.serviceName}`} {noun}{' '}
        label on <span className={RECORD_ID_CLASS}>{orderRef}</span>?
        {purpose === 'return' ? ' Customer → warehouse; most carriers bill a return only once it is scanned.' : ''}
      </p>
      {error ? (
        <p role="alert" className="text-role-data text-mode-warn">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" className={cn(evidenceVerbClass(true), 'flex-1')} disabled={buying} onClick={onBuy}>
          {buying ? 'Buying…' : 'Confirm & buy'}
        </button>
        <button type="button" className={evidenceVerbClass()} disabled={buying} onClick={() => onConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

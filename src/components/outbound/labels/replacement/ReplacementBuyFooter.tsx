'use client';

/** The sticky Buy footer under the rate list → its confirm step. Never buys a stale quote. */

import { Truck } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { formatMoney } from '@/lib/shipping/label-rate-choice';
import { rateTotal } from '@/lib/shipping/replacement-rate-shop';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';

export function ReplacementBuyFooter({
  selectedRate,
  confirming,
  stale,
  orderRef,
  reasonLabel,
  buying,
  error,
  onConfirmOpen,
  onCancel,
  onBuy,
}: {
  selectedRate: ShippingRateOption | null;
  confirming: boolean;
  /** The parcel, insurance or ship-to changed since the quote. */
  stale: boolean;
  orderRef: string;
  reasonLabel: string | null;
  buying: boolean;
  error: string | null;
  onConfirmOpen: () => void;
  onCancel: () => void;
  onBuy: (rate: ShippingRateOption) => void;
}) {
  const total = selectedRate ? formatMoney(rateTotal(selectedRate), selectedRate.currency) : null;
  return (
    <footer className="shrink-0 border-t border-border-hairline px-5 py-3" data-testid="send-replacement-buy-footer">
      {selectedRate && confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-role-caption text-text-default">
            Buy this <span className="font-semibold">{total}</span> {selectedRate.carrierName} {selectedRate.serviceName}{' '}
            replacement label for {orderRef}
            {reasonLabel ? ` · ${reasonLabel}` : ''}?
          </p>
          {error ? (
            <p className="w-full text-role-caption text-text-danger" role="alert">{error}</p>
          ) : null}
          <Button variant="ghost" disabled={buying} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={buying}
            disabled={stale}
            onClick={() => onBuy(selectedRate)}
            data-testid="send-replacement-confirm-buy"
          >
            Confirm &amp; buy
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3">
          <span className="text-role-caption text-text-faint">
            {stale ? 'Refresh rates before buying.' : selectedRate ? null : 'Pick a rate to buy.'}
          </span>
          <Button
            variant="primary"
            size="lg"
            icon={<Truck />}
            disabled={!selectedRate || stale}
            onClick={onConfirmOpen}
            data-testid="send-replacement-buy"
          >
            {total ? `Buy ${total} replacement label` : 'Buy replacement label'}
          </Button>
        </div>
      )}
    </footer>
  );
}

'use client';

import { useState } from 'react';
import { Check } from '@/components/Icons';
import { BuyLabelSection } from '@/components/outbound/labels/BuyLabelSection';
import { EvidenceDisclosure } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { TextField } from '@/design-system/primitives';
import { useOrderLabelSummary } from '@/lib/orders/order-paperwork-client';

interface ReturnReplacementLabelSectionProps {
  orderId: number;
  orderRef: string;
  defaultOpen?: boolean;
}

/**
 * The problem-order shipping sequence: bring the failed unit back first, then
 * send its replacement. Both purchases use the existing order-label ledger, so
 * the Labels evidence directly above this section remains the durable record.
 */
export function ReturnReplacementLabelSection({
  orderId,
  orderRef,
  defaultOpen = false,
}: ReturnReplacementLabelSectionProps) {
  const [returnPurchasedInSession, setReturnPurchasedInSession] = useState(false);
  const [replacementPurchasedInSession, setReplacementPurchasedInSession] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  const labelSummary = useOrderLabelSummary(orderId).data;
  const existingReturn = labelSummary?.labels.some(
    (label) => label.purpose === 'return' && label.status === 'purchased',
  ) ?? false;
  const existingReplacement = labelSummary?.labels.some(
    (label) => label.purpose === 'replacement' && label.status === 'purchased',
  ) ?? false;
  const returnPurchased = returnPurchasedInSession || existingReturn;
  const replacementPurchased = replacementPurchasedInSession || existingReplacement;
  const parsedWeight = Number(weightDraft);
  const weightOz = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : null;

  return (
    <EvidenceDisclosure
      label="Problem order"
      summary={replacementPurchased ? 'Both labels bought' : returnPurchased ? 'Replacement next' : 'Return + replacement'}
      testId="return-replacement-labels"
      defaultOpen={defaultOpen}
    >
      <div className="space-y-4 px-4 py-3">
        <p className="text-role-caption text-mode-muted">
          Buy both labels against {orderRef}: return brings the problem unit back; replacement sends the working unit to the customer.
        </p>
        <TextField
          label="Package weight for both labels (oz)"
          value={weightDraft}
          onChange={setWeightDraft}
          type="number"
          min="0.1"
          step="0.1"
          inputMode="decimal"
        />
        <p className="-mt-2 text-role-eyebrow text-mode-muted">
          Leave blank to use the parcel already stored on the order or in ShipStation.
        </p>


        <section aria-label="Return label" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-role-caption font-semibold text-mode-ink">1. Return</h4>
            {returnPurchased ? (
              <span className="flex items-center gap-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-success">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Bought
              </span>
            ) : null}
          </div>
          {existingReturn && !returnPurchasedInSession ? (
            <p className="text-role-caption text-mode-muted">
              A return label is already recorded in Labels above.
            </p>
          ) : (
            <BuyLabelSection
              orderId={orderId}
              orderRef={orderRef}
              fixedPurpose="return"
              weightOz={weightOz}
              onChange={() => undefined}
              onAnyPurchased={() => setReturnPurchasedInSession(true)}
            />
          )}
        </section>

        <section aria-label="Replacement label" className="space-y-2 border-t border-mode-edge pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-role-caption font-semibold text-mode-ink">2. Replacement</h4>
            {replacementPurchased ? (
              <span className="flex items-center gap-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-success">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Bought
              </span>
            ) : null}
          </div>
          {existingReplacement && !replacementPurchasedInSession ? (
            <p className="text-role-caption text-mode-muted">
              A replacement label is already recorded in Labels above.
            </p>
          ) : returnPurchased ? (
            <BuyLabelSection
              orderId={orderId}
              orderRef={orderRef}
              fixedPurpose="replacement"
              weightOz={weightOz}
              onChange={() => undefined}
              onAnyPurchased={() => setReplacementPurchasedInSession(true)}
            />
          ) : (
            <p className="text-role-caption text-mode-muted">
              Buy the return label first so the two shipments cannot be confused.
            </p>
          )}
        </section>
      </div>
    </EvidenceDisclosure>
  );
}

'use client';

/**
 * The cart's DONE face — the visit shipped, here are the receipts.
 *
 * Extracted from `KioskCartLedger` 2026-09-15 when the cart was ported onto
 * {@link KioskPaneForm}: the ledger's job is the stepper and the submit, and a
 * terminal face with its own two verbs is a different job on the same sheet.
 *
 * Wears the SAME frame as the step flow, with every segment filled. That is
 * deliberate — the visit's units are all satisfied, and keeping the band is
 * what gives this face a way out (X, top-left) without re-growing a titled
 * header just for the done state. One band per pane, no exceptions.
 *
 * Callers: `KioskCartLedger`.
 * Affected API: GET /api/kiosk/visit/[id]/receipt.
 * Schemas: `CounterTransactionResult`.
 * User: "print out a receipt including everything" + "give internal staff an
 * internal record"; def-of-done "select product, add to cart, print receipt" —
 * the customer receipt is the primary key of this face, the staff copy its
 * secondary partner.
 */

import { Button } from '@/design-system/primitives';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KIOSK_CART_STEPS } from '@/lib/kiosk/cart-step-gates';
import { KIOSK_POS_CTA, KIOSK_POS_CTA_SECONDARY } from '@/app/kiosk/kiosk-pos-surface';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';

/** What checked in — one sentence, in the words the counter uses out loud. */
function doneSummary(result: CounterTransactionResult): string {
  if (result.repairs.length === 1) return `Service ${result.repairs[0].rsNumber} checked in.`;
  if (result.repairs.length > 1) {
    return `${result.repairs.length} services checked in — ${result.repairs
      .map((r) => r.rsNumber)
      .join(', ')}.`;
  }
  return 'Sale staged at the register.';
}

function openReceipt(transactionId: number | string, staffCopy = false) {
  window.open(
    `/api/kiosk/visit/${transactionId}/receipt?print=1${staffCopy ? '&copy=staff' : ''}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export function KioskCartDoneFace({
  result,
  onClose,
  onNextCustomer,
}: {
  result: CounterTransactionResult;
  /** X, top-left — leaves the cart without resetting the visit. */
  onClose: () => void;
  /** Clears the ticket and returns the stepper to its first unit. */
  onNextCustomer: () => void;
}) {
  return (
    <KioskPaneForm
      testId="kiosk-cart-pane"
      progress={{
        current: KIOSK_CART_STEPS.length,
        total: KIOSK_CART_STEPS.length,
        onClose,
        closeLabel: 'Close cart',
        label: 'Cart progress',
      }}
      hero={
        <>
          <p className="text-lg font-semibold tracking-tight">All set</p>
          <p className="text-sm font-semibold text-text-soft">{doneSummary(result)}</p>
          <div className="flex w-full max-w-sm flex-col gap-2">
            <Button
              size="lg"
              className={KIOSK_POS_CTA}
              data-testid="kiosk-print-customer-receipt"
              onClick={() => openReceipt(result.counterTransactionId)}
            >
              Print receipt
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className={KIOSK_POS_CTA_SECONDARY}
              data-testid="kiosk-print-staff-receipt"
              onClick={() => openReceipt(result.counterTransactionId, true)}
            >
              Print staff record
            </Button>
          </div>
        </>
      }
      footer={
        <Button
          size="lg"
          className={KIOSK_POS_CTA}
          data-testid="kiosk-cart-next-customer"
          onClick={onNextCustomer}
        >
          Next customer
        </Button>
      }
    />
  );
}

/**
 * Shared kiosk counter → `/api/kiosk/intake` body builder.
 *
 * Portrait `CounterIntakeForm` hosts and landscape `KioskCounterPane` must
 * post the same shape so landscape/portrait cannot drift on retailLines /
 * serviceLine / priorOrder / ticketWork / takePayment.
 */

import type { CounterDraft } from '@/components/counter/counter-intake-steps';
import { activeServiceLine } from '@/components/counter/counter-intake-steps';
import type { CounterTransactionInput } from '@/lib/counter/counter-transaction-types';

interface KioskIntakeBodyOpts {
  /** Hand-off to the register — requires staffId + pin on the wire. */
  takePayment: boolean;
  staffId?: number;
  pin?: string;
}

type SalesIntakeParts = Pick<
  CounterTransactionInput,
  'customer' | 'retailLines' | 'services' | 'priorOrder' | 'ticketWork'
>;

/**
 * JSON body for `POST /api/kiosk/intake` with `service: 'sales'`.
 * Does not set Idempotency-Key — callers mint that as a header.
 */
export function buildKioskSalesIntakeBodyFromInput(
  input: SalesIntakeParts,
  opts: KioskIntakeBodyOpts,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    service: 'sales',
    customer: input.customer,
    retailLines: input.retailLines,
    serviceLines: input.services ?? [],
    priorOrder: input.priorOrder,
    ticketWork: input.ticketWork,
    takePayment: opts.takePayment,
  };
  if (opts.staffId != null && opts.pin) {
    body.staffId = opts.staffId;
    body.pin = opts.pin;
  }
  return body;
}

/** Draft → intake body (landscape `KioskCounterPane`). */
export function buildKioskSalesIntakeBody(
  draft: CounterDraft,
  opts: KioskIntakeBodyOpts,
): Record<string, unknown> {
  // The draft form is structurally single-device (one `service`, one
  // signature), so it contributes at most one entry. Widening THAT model is a
  // separate surface — see counter-intake-steps.ts.
  const service = activeServiceLine(draft);
  return buildKioskSalesIntakeBodyFromInput(
    {
      customer: {
        phone: draft.phone,
        name: draft.name || null,
        email: draft.email || null,
      },
      retailLines: draft.retailLines,
      services: service
        ? [
            {
              ...service,
              signatureDataUrl: draft.signatureDataUrl,
              signatureStrokes: draft.signatureStrokes,
            },
          ]
        : [],
      priorOrder: draft.priorOrderNumber.trim()
        ? { orderNumber: draft.priorOrderNumber.trim(), phone: draft.phone }
        : null,
      ticketWork: service ? { mode: 'create' } : { mode: 'none' },
    },
    opts,
  );
}

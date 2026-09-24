/**
 * Kiosk cart → `/api/kiosk/intake` body builder.
 *
 * Caller: `submitKioskVisit` (the cart's Save / Pay). Affected API:
 * POST `/api/kiosk/intake`. Schemas: `CounterTransactionInput`.
 */

import type { CounterTransactionInput } from '@/lib/counter/counter-transaction-types';

interface KioskIntakeBodyOpts {
  /** Hand-off to the register — requires staffId + pin on the wire. */
  takePayment: boolean;
  staffId?: number;
  pin?: string;
}

type SalesIntakeParts = Pick<
  CounterTransactionInput,
  'customer' | 'retailLines' | 'services' | 'linkedRepairs' | 'priorOrder' | 'ticketWork'
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
    linkedRepairs: input.linkedRepairs ?? [],
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

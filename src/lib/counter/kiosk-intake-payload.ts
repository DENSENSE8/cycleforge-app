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
  /**
   * Lines voided during the visit, each with the signed approval the void
   * was authorized (and audited) under. The route lists them on the visit.
   */
  voidedLines?: Array<{ approval: string; title: string; quantity: number; unitAmountCents: number }>;
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
  if (opts.voidedLines && opts.voidedLines.length > 0) {
    body.voidedLines = opts.voidedLines;
  }
  if (opts.staffId != null && opts.pin) {
    body.staffId = opts.staffId;
    body.pin = opts.pin;
  }
  return body;
}

'use client';

/**
 * submitKioskVisit — the ONE way a kiosk visit reaches the counter.
 *
 * ## Why this exists
 * There were two. The cart posted `/api/kiosk/intake` (a counter header, N
 * `repair_service` rows, staged retail, ticket outbox, optional payment); the
 * repair pane posted a device-authed endpoint of its own that wrote one bare
 * repair row — no header, no visit, no payment. That endpoint is deleted with
 * this module. So a drop-off checked in from the pane never became a
 * transaction the desk could see or charge, and a customer with a repair AND a
 * case on the counter could be checked in twice. Whichever key the staffer
 * happened to press decided which of those two things happened, which is not a
 * decision a key should make.
 *
 * Now both keys call this, so "Submit repair" and the cart's Save/Pay are the
 * same verb at different altitudes, and there is exactly one success document
 * to render afterwards ({@link KioskCartDoneFace}).
 *
 * The idempotency key belongs to the CALLER and must survive a retry: the
 * counter dedupes on it (`clientEventId`), and a fresh key on the second press
 * of a timed-out submit is how a visit gets recorded twice.
 *
 * Callers: `KioskCartLedger`, `KioskRepairPane`. Affected API:
 * `POST /api/kiosk/intake`. Schemas: `counter_transactions`, `repair_service`.
 */

import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import { mapKioskCartToCounterParts } from '@/lib/kiosk/cart-to-counter';
import { kioskTicketWork } from '@/lib/kiosk/repair-ticket-choice';
import type { KioskTicketChoice } from '@/lib/kiosk/repair-ticket-choice';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { buildKioskSalesIntakeBodyFromInput } from '@/lib/counter/kiosk-intake-payload';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';

/** The visit facts the submit reads — a structural slice of the session root. */
export interface KioskVisitSubmitSession {
  lines: readonly KioskCartLine[];
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  ticketChoice: KioskTicketChoice | null;
}

export interface KioskVisitSubmitOptions {
  /** Same string across every retry of ONE submit. See module doc. */
  idempotencyKey: string;
  takePayment: boolean;
  /** Step-up credentials — present only when the desk authorized a charge. */
  staffId?: number;
  pin?: string;
}

export async function submitKioskVisit(
  session: KioskVisitSubmitSession,
  options: KioskVisitSubmitOptions,
): Promise<CounterTransactionResult> {
  const { retailLines, services } = mapKioskCartToCounterParts(session.lines);

  const res = await kioskFetchHealed('/api/kiosk/intake', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': options.idempotencyKey,
    },
    body: JSON.stringify(
      buildKioskSalesIntakeBodyFromInput(
        {
          customer: {
            phone: session.customerPhone,
            name: session.customerName || null,
            email: session.customerEmail || null,
            address: session.customerAddress || null,
          },
          retailLines,
          services,
          priorOrder: null,
          /*
           * The VISIT's decision, not a hardcoded create: the repair flow's
           * last step answers it (`KioskTicketStep`), and `kioskTicketWork`
           * falls back to `create` so a service visit nobody answered still
           * files a ticket exactly as before.
           */
          ticketWork: kioskTicketWork(session.ticketChoice, services.length > 0),
        },
        { takePayment: options.takePayment, staffId: options.staffId, pin: options.pin },
      ),
    ),
  });

  const body = (await res.json().catch(() => ({}))) as {
    transaction?: CounterTransactionResult;
    error?: string;
  };

  // Step-up is a DIFFERENT failure from a rejected transaction: the operator can
  // fix a PIN in place, so it must not read as "transaction failed".
  if (res.status === 403 && body.error === 'STEPUP_FAILED') {
    throw new Error('PIN incorrect. Try again.');
  }
  if (res.status === 403 && body.error?.includes('STEPUP')) {
    throw new Error('A manager needs to authorize payment on this tablet.');
  }
  if (!res.ok || !body.transaction) {
    throw new Error(body.error?.trim() || 'Transaction failed');
  }

  return body.transaction;
}

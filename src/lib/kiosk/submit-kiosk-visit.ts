'use client';

/** submitKioskVisit — the ONE way a kiosk visit reaches the counter. */

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
  const { retailLines, services, linkedRepairs } = mapKioskCartToCounterParts(session.lines);

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
          linkedRepairs,
          priorOrder: null,
          /* The VISIT's decision, not a hardcoded create: */
          ticketWork: kioskTicketWork(session.ticketChoice, services.length > 0),
        },
        {
          takePayment: options.takePayment,
          staffId: options.staffId,
          pin: options.pin,
        },
      ),
    ),
  });

  const body = (await res.json().catch(() => ({}))) as {
    transaction?: CounterTransactionResult;
    error?: string;
    message?: string;
  };

  // Step-up is a DIFFERENT failure from a rejected transaction: the operator can
  // fix a PIN in place, so it must not read as "transaction failed".
  if (res.status === 403 && body.error === 'STEPUP_FAILED') {
    throw new Error('PIN incorrect. Try again.');
  }
  // A line whose price no longer matches its manager approval: name the line
  // so the operator knows which one to re-authorize.
  if (res.status === 403 && body.error === 'PRICE_APPROVAL') {
    throw new Error(body.message?.trim() || 'A price on this cart needs a manager PIN again.');
  }
  if (res.status === 403 && body.error?.includes('STEPUP')) {
    throw new Error('A manager needs to authorize payment on this tablet.');
  }
  if (!res.ok || !body.transaction) {
    throw new Error(body.error?.trim() || 'Transaction failed');
  }

  return body.transaction;
}

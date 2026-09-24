'use client';

/**
 * useKioskCustomerMatch — Square's phone-first customer lookup: the moment the
 * tenth digit lands, ask whether that phone is on file.
 *
 * Callers: `KioskCustomerIntake` (Contact information, cart + repair).
 * Affected API: GET `/api/kiosk/customer` via `kioskFetchHealed`.
 * Schemas: none of its own.
 * User: "typing a phone number looks up an existing customer" (2026-09-24).
 *
 * Only a whole number is asked about — a partial one is a prefix search, which
 * the route refuses. A failed lookup reads as `idle`: submit still resolves
 * identity on the server, so a dead network never blocks the visit.
 */

import { useEffect, useState } from 'react';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';

export type KioskCustomerMatch =
  | { status: 'idle' }
  | { status: 'looking' }
  | { status: 'found'; name: string }
  | { status: 'new' };

const PHONE_DIGITS = 10;

export function useKioskCustomerMatch(phone: string): KioskCustomerMatch {
  const digits = phone.replace(/\D/g, '');
  const complete = digits.length === PHONE_DIGITS;
  const [answer, setAnswer] = useState<{ digits: string; match: KioskCustomerMatch } | null>(null);

  useEffect(() => {
    if (!complete) return;
    const controller = new AbortController();
    kioskFetchHealed(`/api/kiosk/customer?phone=${digits}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return { status: 'idle' } as const;
        const json = (await res.json()) as { customer: { name: string } | null };
        return json.customer
          ? ({ status: 'found', name: json.customer.name.trim() } as const)
          : ({ status: 'new' } as const);
      })
      .catch(() => ({ status: 'idle' }) as const)
      .then((match) => {
        if (!controller.signal.aborted) setAnswer({ digits, match });
      });
    return () => controller.abort();
  }, [complete, digits]);

  if (!complete) return { status: 'idle' };
  return answer?.digits === digits ? answer.match : { status: 'looking' };
}

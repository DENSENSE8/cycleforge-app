'use client';

/** useKioskCustomerMatch — Square's phone-first customer lookup: */

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

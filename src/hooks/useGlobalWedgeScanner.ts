'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { routeScan } from '@/lib/barcode-routing';

/**
 * Mount once at the app root. Every wedge scan is classified via
 * {@link routeScan}; URL-shaped payloads (printed QR labels) get navigated
 * to immediately. Bare SKUs / serials / bin codes are emitted as a
 * `wedge-scan` window CustomEvent so pages that want their own behavior
 * (e.g. the receiving sidebar) can listen.
 *
 * Tactile + audible feedback fires on every accepted scan so the user knows
 * the read landed — important on noisy floors.
 */
export function useGlobalWedgeScanner(): void {
  const router = useRouter();

  const onScan = useCallback(
    (value: string) => {
      const route = routeScan(value);

      // Cancelable so a page handler (e.g. Unbox History Band 3 find) can claim
      // the buffer and skip URL navigation without a second wedge listener.
      let claimed = false;
      try {
        const event = new CustomEvent('wedge-scan', {
          detail: { value, route },
          cancelable: true,
        });
        window.dispatchEvent(event);
        claimed = event.defaultPrevented;
      } catch {
        /* CustomEvent is universally available; just being defensive */
      }

      if (claimed) return;

      if (route?.redirect) {
        router.push(route.redirect);
      }
    },
    [router],
  );

  useWedgeScanner({ onScan });
}

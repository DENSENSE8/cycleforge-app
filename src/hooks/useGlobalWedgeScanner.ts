'use client';

import { startTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { routeScan } from '@/lib/barcode-routing';
import { dispatchScanToActiveSink } from '@/lib/station-scan-sink';
import { deliverScanToTarget } from '@/lib/scan-hotkey/store';
import { isScanPreview } from '@/components/station/scan-bar/scan-stance';

/**
 * Mount once at the app root. Every wedge scan is classified via
 * {@link routeScan}; URL-shaped payloads (printed QR labels) get navigated
 * to immediately. Bare SKUs / serials / bin codes are emitted as a
 * `wedge-scan` window CustomEvent so pages that want their own behavior
 * (e.g. the receiving sidebar) can listen.
 *
 * After page claimers, the active Action-plane scan sink
 * ({@link dispatchScanToActiveSink}) may consume the payload — Unbox dock /
 * serial, Testing line adder, Pack / scan-out bars — before any URL redirect.
 * Editable focus still owns keys via {@link useWedgeScanner}'s bail-out; the
 * sink covers non-editable focus (row / chrome) with zero-latency Map lookup.
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

      // ── Preview stance is enforced HERE, at the one waist every wedge scan
      // crosses — not per host. A physical scan lands on whatever holds focus,
      // which on a bench is usually a row or the chrome, not the input; so with
      // the guard only on the typed-submit path a scanner sailed straight into
      // `routeScan` → navigate and Preview never fired at all. Filling the bar
      // (rather than resolving) is the whole contract of the stance: no write,
      // no navigation, no unbox attribution.
      if (isScanPreview() && deliverScanToTarget(value)) return;

      // Action-plane sink (dock / serial / station bar) before URL navigation.
      if (dispatchScanToActiveSink(value)) return;

      const redirect = route?.redirect;
      if (redirect) {
        // Navigation is a transition — never block the next wedge char.
        startTransition(() => {
          router.push(redirect);
        });
      }
    },
    [router],
  );

  useWedgeScanner({ onScan });
}

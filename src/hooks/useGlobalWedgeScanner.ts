'use client';

import { startTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { routeScan } from '@/lib/barcode-routing';
import { dispatchScanToActiveSink } from '@/lib/station-scan-sink';
import { deliverScanToTarget } from '@/lib/scan-hotkey/store';
import { isScanPreview } from '@/components/station/scan-bar/scan-stance';
import { useStationCommandScan } from '@/hooks/useStationCommandScan';

/** Mount once at the app root. */
export function useGlobalWedgeScanner(): void {
  const router = useRouter();
  const tryCommand = useStationCommandScan();

  const onScan = useCallback(
    (value: string) => {
      // ── Commands are read FIRST, ahead of every page claimer.
      if (tryCommand(value)) return;

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

      // ── Preview stance is enforced HERE, at the one waist every wedge scan crosses — not per host.
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
    [router, tryCommand],
  );

  useWedgeScanner({ onScan });
}

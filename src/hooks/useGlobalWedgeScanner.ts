'use client';

import { startTransition, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { routeScan } from '@/lib/barcode-routing';
import { dispatchScanToActiveSink } from '@/lib/station-scan-sink';
import { deliverScanToTarget } from '@/lib/scan-hotkey/store';
import { isScanPreview } from '@/components/station/scan-bar/scan-stance';
import { useStationCommandScan } from '@/hooks/useStationCommandScan';
import { mountScanKernel, resolveScanDestination } from '@/lib/scan/scan-kernel';
import { recordDetailsNavigation } from '@/lib/records/record-details';
import { isMobileFirstPath } from '@/lib/mobile/mobile-first-surface';
import { openCommandBar } from '@/lib/app-events';
import { toast } from '@/lib/toast';

/** Mount once at the app root — the scan identification kernel's waist (`src/lib/scan/scan-kernel.ts`). */
export function useGlobalWedgeScanner(): void {
  const router = useRouter();
  const tryCommand = useStationCommandScan();
  // A newer scan supersedes a lookup still in flight.
  const latest = useRef(0);

  const openResolved = useCallback(
    async (value: string) => {
      const ticket = ++latest.current;
      const { pathname, search } = window.location;
      const surface = isMobileFirstPath(pathname) ? 'phone' : 'desk';
      const destination = await resolveScanDestination(value, surface, pathname);
      if (ticket !== latest.current) return;
      switch (destination.kind) {
        case 'record': {
          const next = recordDetailsNavigation(destination.href, { pathname, search });
          startTransition(() => {
            if (next.mode === 'replace') router.replace(next.href, { scroll: false });
            else router.push(next.href, { scroll: false });
          });
          return;
        }
        case 'href':
          startTransition(() => router.push(destination.href));
          return;
        case 'ambiguous':
          if (surface === 'desk') openCommandBar({ query: value, scope: 'everywhere' });
          else toast.info(`${destination.count} orders match ${value}`);
          return;
        case 'none':
          toast.warning(`Nothing matches ${value}`);
          return;
        case 'error':
          toast.error(`Couldn't look up ${value}`);
      }
    },
    [router],
  );

  const onScan = useCallback(
    (value: string) => {
      // ── Commands are read FIRST, ahead of every page claimer.
      if (tryCommand(value)) return;

      const route = routeScan(value);
      // Cancelable, so a page that consumes scans as input (a station bar, a
      // pick, a tote sheet) can claim the buffer. Claiming is never a way to
      // filter a list: a scan always goes to its record.
      const event = new CustomEvent('wedge-scan', {
        detail: { value, route },
        cancelable: true,
      });
      window.dispatchEvent(event);
      if (event.defaultPrevented) return;

      // A claimer may decide once every listener has seen the event (a
      // microtask queued during dispatch, e.g. the location hub): it claims
      // by calling `preventDefault()` then, and this check runs after it.
      queueMicrotask(() => {
        if (event.defaultPrevented) return;

        // ── Preview stance is enforced HERE, at the one waist every wedge scan crosses — not per host.
        if (isScanPreview() && deliverScanToTarget(value)) return;

        // Action-plane sink (dock / serial / station bar) before URL navigation.
        if (dispatchScanToActiveSink(value)) return;

        const redirect = route?.redirect;
        if (redirect) {
          latest.current += 1;
          // Navigation is a transition — never block the next wedge char.
          startTransition(() => {
            router.push(redirect);
          });
          return;
        }
        void openResolved(value);
      });
    },
    [openResolved, router, tryCommand],
  );

  useWedgeScanner({ onScan });
  useEffect(() => mountScanKernel(onScan), [onScan]);
}

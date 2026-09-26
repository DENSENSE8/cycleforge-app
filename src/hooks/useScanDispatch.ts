'use client';

/** useScanDispatch — the shared producer seam between a wedge scan and {@link dispatchScan}. */

import { useCallback } from 'react';
import { routeScan } from '@/lib/barcode-routing';
import type { ScanRoute } from '@/lib/barcode-routing';
import {
  dispatchScan,
  type ArmedScanSession,
  type ScanDispatch,
  type ScanObjectState,
} from '@/lib/scan/dispatch-table';

/** Classes whose Card can turn on prior object state — only these fetch. */
const OBJECT_STATE_CLASSES: ReadonlySet<ScanRoute['type']> = new Set([
  'handling-unit',
  'sscc',
  'bin',
]);

async function trackingSeen(raw: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/receiving/preview-scan?value=${encodeURIComponent(raw)}&mode=tracking`,
      { credentials: 'include' },
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { matched?: boolean };
    return json.matched === true;
  } catch {
    return false;
  }
}

/** Resolve one raw scan to its dispatch — the Card, session title, mode, reason and destination — fetching object state only when the class… */
export function useScanDispatch() {
  const resolve = useCallback(async (
    raw: string,
    armedSession: ArmedScanSession | null = null,
  ): Promise<ScanDispatch | null> => {
    const route = routeScan(raw);
    if (!route) return null;

    if (route.type === 'carrier-tracking') {
      return dispatchScan({ scan: route, state: { trackingSeen: await trackingSeen(raw) }, armedSession });
    }

    if (!OBJECT_STATE_CLASSES.has(route.type)) {
      return dispatchScan({ scan: route, armedSession });
    }

    let state: ScanObjectState = {};
    try {
      const res = await fetch(
        `/api/scan/object-state?value=${encodeURIComponent(raw)}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          success?: boolean;
          state?: ScanObjectState;
        };
        if (json.success && json.state) state = json.state;
      }
    } catch {
      /* offline / hard failure → honest empty state, never a guess */
    }

    return dispatchScan({ scan: route, state, armedSession });
  }, []);

  return { resolve };
}

'use client';

/**
 * useScanDispatch — the shared producer seam between a wedge scan and
 * {@link dispatchScan}.
 *
 * The dispatch table is pure: class × object state → Card. The CLASS is free
 * (`routeScan` decodes the bytes locally, instantly). The STATE is a fact
 * about the object, and only some classes can turn on it — so only those pay
 * the one read-only roundtrip to `/api/scan/object-state`. Everything else
 * dispatches synchronously with no state, which is the table's honest default
 * (preview), not a guess.
 *
 * Failure discipline: an offline phone or a 5xx resolves to the SAME honest
 * empty state as an unknown object. The class defaults answer, the scan never
 * strands, and nothing is invented — the operator sees the preview Card and
 * the box page rather than a fabricated "staged for pack".
 *
 * There is deliberately no cache: box state changes precisely because the
 * operator acted on the last scan's answer (staging a tote, closing its QC),
 * so serving yesterday's dispatch would lag one action behind the floor. A
 * cache that can only be wrong after the operator did the right thing is not
 * a cache, it is a lie with a hit rate.
 */

import { useCallback } from 'react';
import { routeScan } from '@/lib/barcode-routing';
import type { ScanRoute } from '@/lib/barcode-routing';
import {
  dispatchScan,
  type ScanDispatch,
  type ScanObjectState,
} from '@/lib/scan/dispatch-table';

/** Classes whose Card can turn on prior object state — only these fetch. */
const OBJECT_STATE_CLASSES: ReadonlySet<ScanRoute['type']> = new Set([
  'handling-unit',
  'sscc',
  'bin',
]);

/**
 * Resolve one raw scan to its dispatch — the Card, session title, mode,
 * reason and destination — fetching object state only when the class can use
 * it. `null` only when the value does not decode at all.
 */
export function useScanDispatch() {
  const resolve = useCallback(async (raw: string): Promise<ScanDispatch | null> => {
    const route = routeScan(raw);
    if (!route) return null;

    if (!OBJECT_STATE_CLASSES.has(route.type)) {
      return dispatchScan({ scan: route });
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

    return dispatchScan({ scan: route, state });
  }, []);

  return { resolve };
}

'use client';

/** Testing scan bridge — sidebar scan band ⇄ middle workspace: a scan's pending multi-match pick. */

import { useEffect, useState } from 'react';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ResolvedVia } from '@/lib/testing/resolve-testing-scan';

/**
 * A scan that resolved to MORE THAN ONE candidate line (`kind: 'multi'` from
 * `resolveTestingScan`) — several serial matches, several pre-packed lines for
 * one SKU, several items on one PO.
 */
export interface TestingScanPick {
  rows: ReceivingLineRow[];
  via?: ResolvedVia;
  /** The raw scan that produced the ambiguity, echoed by the middle surface. */
  value: string;
}

const TESTING_SCAN_PICK_EVENT = 'testing-scan-pick-changed';
const TESTING_SCAN_PICK_RESOLVED_EVENT = 'testing-scan-pick-resolved';

let lastPick: TestingScanPick | null = null;

/** Publish (or clear) the pending choice. */
export function publishTestingScanPick(pick: TestingScanPick | null): void {
  lastPick = pick;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TestingScanPick | null>(TESTING_SCAN_PICK_EVENT, { detail: pick }),
  );
}

/** Subscribe to the pending choice. Seeds from the last publish on mount. */
export function useTestingScanPick(): TestingScanPick | null {
  const [pick, setPick] = useState<TestingScanPick | null>(lastPick);

  useEffect(() => {
    setPick(lastPick);
    const handler = (e: Event) => {
      setPick((e as CustomEvent<TestingScanPick | null>).detail ?? null);
    };
    window.addEventListener(TESTING_SCAN_PICK_EVENT, handler);
    return () => window.removeEventListener(TESTING_SCAN_PICK_EVENT, handler);
  }, []);

  return pick;
}

/** The middle → scan column direction: */
export function resolveTestingScanPick(row: ReceivingLineRow): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ReceivingLineRow>(TESTING_SCAN_PICK_RESOLVED_EVENT, { detail: row }),
  );
}

/** Scan-column side of {@link resolveTestingScanPick}. */
export function useTestingScanPickResolved(
  onResolved: (row: ReceivingLineRow) => void,
): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const row = (e as CustomEvent<ReceivingLineRow>).detail;
      if (row) onResolved(row);
    };
    window.addEventListener(TESTING_SCAN_PICK_RESOLVED_EVENT, handler);
    return () => window.removeEventListener(TESTING_SCAN_PICK_RESOLVED_EVENT, handler);
  }, [onResolved]);
}

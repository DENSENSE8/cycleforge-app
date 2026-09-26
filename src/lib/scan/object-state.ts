/** Scan object state — the READ behind the dispatch table's `state` argument. */

import { routeScan } from '@/lib/barcode-routing';
import type { ScanType } from '@/lib/barcode-routing';
import type { ScanObjectState } from './dispatch-table';
import type { HandlingUnitStatus } from '@/lib/neon/handling-unit-queries';

/**
 * Everything the resolver needs from the warehouse. One method, deliberately:
 * the numeric LPN id is the only key a house label carries that names a row
 * (extracted from the `/m/h/{id}` redirect — the same decode `lpnLabel` uses).
 */
export interface ScanObjectStateDeps {
  /**
   * Status of a house LPN by numeric id, or `null` when no such box exists in
   * the org. MUST be a read.
   */
  getHandlingUnitStatus(id: number): Promise<HandlingUnitStatus | null>;
}

interface ScanObjectStateResult {
  type: ScanType;
  state: ScanObjectState;
  /** False when the object itself is unknown (no row, or a foreign plate). */
  known: boolean;
}

/** Map a box's stored status onto the dispatch table's state facts. */
export function objectStateForHandlingUnitStatus(
  status: HandlingUnitStatus,
): ScanObjectState {
  if (status === 'STAGED') return { stagedForPack: true, qcOpen: false };
  if (status === 'IN_TEST') return { stagedForPack: false, qcOpen: true };
  return { stagedForPack: false, qcOpen: false };
}

/** The LPN id a house label's redirect carries — `/m/h/12` → `12`. */
const HU_REDIRECT_RE = /^\/m\/h\/(\d+)$/;

/** Resolve the object state for one scanned value. */
export async function resolveScanObjectState(
  raw: string,
  deps: ScanObjectStateDeps,
): Promise<ScanObjectStateResult | null> {
  const route = routeScan(raw);
  if (!route) return null;

  if (route.type === 'handling-unit') {
    const m = HU_REDIRECT_RE.exec(route.redirect || '');
    if (!m) return { type: route.type, state: {}, known: false };
    const id = Number(m[1]);
    if (!Number.isFinite(id) || id <= 0) {
      return { type: route.type, state: {}, known: false };
    }
    const status = await deps.getHandlingUnitStatus(id);
    if (!status) return { type: route.type, state: {}, known: false };
    return { type: route.type, state: objectStateForHandlingUnitStatus(status), known: true };
  }

  return { type: route.type, state: {}, known: false };
}

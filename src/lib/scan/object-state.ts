/**
 * Scan object state — the READ behind the dispatch table's `state` argument.
 *
 * `dispatchScan` is pure on purpose: `state` is an argument, never a lookup,
 * so the Card can paint inside its 100 ms budget. But *somebody* has to turn
 * "H-12" into "this licence plate is staged for pack" before the table can
 * name the Card — and that read is exactly this module. It is the tote /
 * licence-plate twin of the door scan's `preview-scan` law
 * (`src/lib/receiving/preview-scan.ts`):
 *
 *   - **It writes nothing.** No row is minted, no status stamped. A scan that
 *     creates state cannot also be the thing that reads it — that loop is how
 *     the door scan once minted an Unfound carton for a never-seen tracking
 *     number and made the Arrival Card unreachable (see
 *     `mobile-arrival-door.ts`'s header).
 *   - **Unknown is an answer, not an error.** A foreign SSCC, a deleted box,
 *     an id that never existed all return `known: false` with an empty state —
 *     the dispatch table's class defaults (preview) are the honest Card.
 *
 * The DB binding lives in `object-state-deps.ts`; this core is dependency-
 * injected and unit-testable with zero network, same seam as
 * `preview-scan` / `preview-scan-deps`.
 */

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

export interface ScanObjectStateResult {
  type: ScanType;
  state: ScanObjectState;
  /** False when the object itself is unknown (no row, or a foreign plate). */
  known: boolean;
}

/**
 * Map a box's stored status onto the dispatch table's state facts.
 *
 * `handling_units.status` is maintained by `refreshHandlingUnitStatus`:
 * OPEN / IN_TEST / CLOSED derive from member test state, while STAGED is an
 * operator-set staging marker that the rollup never overwrites (only the
 * CLOSED terminal beats it). That gives the mapping its teeth:
 *
 *   STAGED   → stagedForPack — the operator flagged this tote for pack-out,
 *              so the pack dispatch row fires and the phone switches to the
 *              Pack station (the "scan a tote → packing mode" flow).
 *   IN_TEST  → qcOpen — members are mid-testing; the QC Card names the box's
 *              open check.
 *   OPEN     → nothing outstanding. An untouched box is not "in QC" — no
 *              check has begun — and the box page is the honest destination.
 *   CLOSED   → nothing outstanding; same honesty.
 */
export function objectStateForHandlingUnitStatus(
  status: HandlingUnitStatus,
): ScanObjectState {
  if (status === 'STAGED') return { stagedForPack: true, qcOpen: false };
  if (status === 'IN_TEST') return { stagedForPack: false, qcOpen: true };
  return { stagedForPack: false, qcOpen: false };
}

/** The LPN id a house label's redirect carries — `/m/h/12` → `12`. */
const HU_REDIRECT_RE = /^\/m\/h\/(\d+)$/;

/**
 * Resolve the object state for one scanned value. `null` only for input that
 * does not decode at all; every decoded class gets an answer, even if that
 * answer is "unknown object, no outstanding state".
 *
 * Only `handling-unit` reaches the deps today. `sscc` is a foreign plate with
 * no local row to name (we store no SSCC on handling units), and `bin` pairing
 * is an order-book fact that has no producer yet — both return the honest
 * empty state rather than a guess, which is exactly what the dispatch table's
 * `bin-unpaired` / preview rows are for.
 */
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

/**
 * Surface-aware scan classification for the receiving Station surfaces (Unbox /
 * Triage). `detectStationScanType` is a pure string heuristic; this layer adds
 * the surface's *context* — which surface issued the scan, and whether the
 * active carton is still short on serials — to resolve the operator's INTENT.
 *
 * The load-bearing rule (mirrors `resolveScanType` in
 * `useStationTestingController`): on a scan surface, when the active carton is
 * still short of its expected serials, a *carrier-unknown* "tracking-looking"
 * barcode is almost certainly the next product SERIAL, not a new carton — so the
 * operator never has to arm a mode mid-flow. Known carrier prefixes still route
 * as TRACKING.
 *
 * Pure + dependency-light so it unit-tests DB-free.
 */

import { detectStationScanType, type StationScanType } from '@/lib/station-scan-routing';
import { getSurface, type SurfaceKey } from '@/lib/stations/surface-keys';

/** What the operator most likely means by this scan, on this surface. */
export type UnboxScanIntent =
  | 'open_carton' // TRACKING → resolve + open (Unbox) / classify + route (Triage)
  | 'add_serial' // a product serial to add to the active carton
  | 'fnsku' // an FBA FNSKU
  | 'repair' // an RS-#### repair ticket
  | 'sku_lookup' // a SKU (`SKU:...`)
  | 'command'; // a keyword command (YES/USED/NEW/PARTS/TEST)

export interface UnboxScanContext {
  /** The surface the scan was issued from (must be a scan surface for overrides). */
  surface: SurfaceKey;
  /**
   * True when a carton is active and still short of its expected serials — the
   * signal that the next scan is a serial, not a new carton.
   */
  activeCartonNeedsSerials?: boolean;
  /**
   * Whether the base TRACKING classification matched a *known* carrier prefix.
   * The caller (which owns carrier detection) passes it; a known carrier always
   * stays TRACKING even mid-carton.
   */
  knownCarrier?: boolean;
}

export interface UnboxScanResult {
  type: StationScanType;
  intent: UnboxScanIntent;
  /** True when surface context overrode the base string classification. */
  reclassified: boolean;
}

function intentFor(type: StationScanType): UnboxScanIntent {
  switch (type) {
    case 'TRACKING':
      return 'open_carton';
    case 'SERIAL':
      return 'add_serial';
    case 'FNSKU':
      return 'fnsku';
    case 'REPAIR':
      return 'repair';
    case 'SKU':
      return 'sku_lookup';
    case 'COMMAND':
      return 'command';
  }
}

export function classifyUnboxScan(raw: string, ctx: UnboxScanContext): UnboxScanResult {
  const base = detectStationScanType(raw);
  // Serial reclassification applies on Unbox only — triage never sees serials
  // (they are inside the sealed carton until unboxing).
  const scanPolicy = getSurface(ctx.surface).scan;

  if (
    scanPolicy === 'unbox' &&
    base === 'TRACKING' &&
    ctx.activeCartonNeedsSerials &&
    !ctx.knownCarrier
  ) {
    return { type: 'SERIAL', intent: 'add_serial', reclassified: true };
  }

  return { type: base, intent: intentFor(base), reclassified: false };
}

/**
 * Minimal line shape for serial-need checks — avoids importing the heavy
 * `ReceivingLineRow` module into this pure classifier.
 */
interface SerialNeedLine {
  quantity_expected?: number | null;
  serial_absent?: boolean | null;
  serials?: Array<{ serial_number?: string | null }> | null;
  units?: Array<{ serial?: string | null; serial_absent?: boolean }> | null;
}

/**
 * Whether a PO line still owes serials (mirrors Unbox `unitsSatisfied` /
 * `deriveReceivingStepFlags`). Line-level waiver (`serial_absent`) satisfies.
 * Missing/zero expected qty → does not owe (avoids trapping unmatched stubs).
 */
export function lineNeedsSerials(line: SerialNeedLine): boolean {
  if (line.serial_absent) return false;
  const expected = Math.max(0, Number(line.quantity_expected) || 0);
  if (expected <= 0) return false;
  const serialCount = (line.serials ?? []).filter((s) =>
    String(s.serial_number ?? '').trim(),
  ).length;
  const perUnitAbsent = (line.units ?? []).filter((u) => u.serial_absent).length;
  return serialCount + perUnitAbsent < expected;
}

/**
 * Carton-level: any sibling line on the open carton still owes serials.
 * `lines` should be the selected line plus `scanMatchedRows` scoped to the
 * same `receiving_id` (caller owns that filter). Callers pass the result as
 * `activeCartonNeedsSerials` into {@link classifyUnboxScan}.
 */
export function cartonNeedsSerials(lines: readonly SerialNeedLine[]): boolean {
  return lines.some(lineNeedsSerials);
}

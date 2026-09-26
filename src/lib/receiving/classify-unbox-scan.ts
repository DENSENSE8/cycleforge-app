/** Surface-aware scan classification for the receiving Station surfaces (Unbox / Triage). */

import { detectStationScanType, type StationScanType } from '@/lib/station-scan-routing';
import { getSurface, type SurfaceKey } from '@/lib/stations/surface-keys';

/** What the operator most likely means by this scan, on this surface. */
export type UnboxScanIntent =
  | 'open_carton' // TRACKING → resolve + open (Unbox) / classify + route (Triage)
  | 'add_serial' // a product serial to add to the active carton
  | 'fnsku' // an FBA FNSKU
  | 'repair' // an RS-#### repair ticket
  | 'sku_lookup' // a SKU (`SKU:...`)
  | 'command' // an unregistered/session `CMD-*` sticker — nack or arm a mode
  /** A registered `CMD-GO-*` sticker. */
  | 'navigate'
  /**
   * A registered action / compound sticker. Like `navigate`, Unbox passes over
   * it — the write is claimed one level up and belongs to the QC bench, not to
   * a carton.
   */
  | 'station_action'
  /** One of OUR printed handles that is not a unit serial — carton, line, LPN, kit manifest, ticket, shelf address. */
  | 'open_handle';

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
    case 'NAV':
      return 'navigate';
    case 'ACTION':
      return 'station_action';
    case 'COMMAND':
      return 'command';
    case 'HANDLE':
      return 'open_handle';
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

/** Carton-level: */
export function cartonNeedsSerials(lines: readonly SerialNeedLine[]): boolean {
  return lines.some(lineNeedsSerials);
}

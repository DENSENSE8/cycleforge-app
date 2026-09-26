/** Arrival (triage) command-barcode traffic cop. */

import { routeScan } from '@/lib/barcode-routing';
import { LOCATIONS_BAY_CODE_RE } from '@/lib/inventory/locations-path';
import {
  ARRIVAL_CMD_BATCH_SORT,
  ARRIVAL_CMD_DEFAULT,
  parseStationCommand,
  type StationCommandMode,
} from '@/lib/stations/station-command-codes';

export { ARRIVAL_CMD_BATCH_SORT, ARRIVAL_CMD_DEFAULT };

export type ArrivalScanMode = StationCommandMode;

type ArrivalScanKind = 'command' | 'location' | 'tracking';

type ArrivalCommand = StationCommandMode;

interface ArrivalScanClassification {
  kind: ArrivalScanKind;
  /** Normalized raw (trimmed). */
  raw: string;
  /** Set when kind === 'command'. */
  command?: ArrivalCommand;
  /**
   * Flat barcode for GET /api/locations/[barcode] when kind === 'location'.
   * Already unwrapped (LOC- stripped, GS1/dashed → flat).
   */
  locationBarcode?: string;
}

/**
 * Strip an optional `LOC-` prefix, then accept only confidently decoded
 * location labels (flat / dashed / GS1) — i.e. `routeScan` → bin **with** a
 * redirect. Letter-only guesses without a redirect are rejected.
 */
export function extractArrivalLocationBarcode(raw: string): string | null {
  let value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^LOC-/i.test(value)) {
    value = value.slice(4).trim();
    if (!value) return null;
  }

  const route = routeScan(value);
  if (!route || route.type !== 'bin' || !route.redirect) return null;

  const bin = /^\/inventory\?bin=(.+)$/.exec(route.redirect);
  if (bin) {
    const code = decodeURIComponent(bin[1]).trim();
    return code || null;
  }
  const bay = LOCATIONS_BAY_CODE_RE.exec(route.redirect);
  if (bay) {
    const code = decodeURIComponent(bay[1]).trim();
    return code || null;
  }
  return null;
}

/**
 * Classify a triage scan given the current session mode.
 *
 * Order: command → (batch_sort only) location → tracking.
 */
export function classifyArrivalScan(
  rawInput: string,
  mode: ArrivalScanMode,
): ArrivalScanClassification {
  const raw = String(rawInput ?? '').trim();
  if (!raw) {
    return { kind: 'tracking', raw: '' };
  }

  const command = parseStationCommand(raw);
  if (command) {
    return { kind: 'command', raw, command };
  }

  if (mode === 'batch_sort') {
    const locationBarcode = extractArrivalLocationBarcode(raw);
    if (locationBarcode) {
      return { kind: 'location', raw, locationBarcode };
    }
  }

  return { kind: 'tracking', raw };
}

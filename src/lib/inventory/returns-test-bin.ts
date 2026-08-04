/**
 * Returns testing bin — special barcode location that receiving auto-stages
 * return cartons into on carton-label scan.
 *
 * Mirrors {@link ./parts-sort} (TECH-PARTS): seeded barcode + cached
 * lookup. Org setting `receiving.returnsTestBin` (via callers) selects the
 * symbol; env `RETURNS_TEST_BIN_BARCODE` is the last-resort override.
 *
 * Server-only — browser code must import {@link ./returns-test-bin-symbol} instead.
 */

import {
  findLocationByBarcode,
  findLocationByName,
} from '@/lib/repositories/inventory/locations';
import {
  DEFAULT_RETURNS_TEST_BIN_BARCODE,
  returnsTestBinSymbol,
} from '@/lib/inventory/returns-test-bin-symbol';

interface ReturnsTestBin {
  id: number;
  name: string;
  barcode: string | null;
  room: string | null;
}

// Per-barcode cache (mirrors mark-received default putaway). `undefined` = not
// looked up yet; `null` = looked up and missing.
const cachedByBarcode = new Map<string, ReturnsTestBin | null>();

/** Resolve the returns testing bin location, or null if it isn't seeded. */
export async function resolveReturnsTestBin(opts?: {
  /** Barcode from org settings / env; defaults to {@link returnsTestBinSymbol}. */
  barcode?: string | null;
}): Promise<ReturnsTestBin | null> {
  const barcode = returnsTestBinSymbol(opts?.barcode) || DEFAULT_RETURNS_TEST_BIN_BARCODE;
  if (cachedByBarcode.has(barcode)) return cachedByBarcode.get(barcode)!;
  try {
    const loc =
      (await findLocationByBarcode(barcode)) ?? (await findLocationByName(barcode));
    const resolved: ReturnsTestBin | null = loc
      ? {
          id: loc.id,
          name: loc.name,
          barcode: loc.barcode ?? null,
          room: loc.room ?? null,
        }
      : null;
    cachedByBarcode.set(barcode, resolved);
    return resolved;
  } catch (err) {
    console.warn(`[returns-test-bin] lookup failed for barcode=${barcode}:`, err);
    cachedByBarcode.set(barcode, null);
    return null;
  }
}

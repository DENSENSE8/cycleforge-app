/**
 * Special bare-barcode bins — seeded locations without aisle/bay grid
 * addresses (`row_label` / `col_label` null). Shared by bins-overview
 * (list inclusion) and the 2×1 label face (print presets).
 */

import {
  DEFAULT_RETURNS_TEST_BIN_BARCODE,
  returnsTestBinSymbol,
} from '@/lib/inventory/returns-test-bin-symbol';

/** Built-in special bin barcodes (TECH-PARTS, UNSORTED, RETURNS-TEST). */
export const SPECIAL_BIN_BARCODES = [
  DEFAULT_RETURNS_TEST_BIN_BARCODE,
  'TECH-PARTS',
  'UNSORTED',
] as const;

/**
 * Barcodes that bins-overview must include even without row/col labels.
 * Always includes the built-ins; folds in a configured returns override.
 */
export function specialBinBarcodesForOverview(
  returnsOverride?: string | null,
): string[] {
  const returns = returnsTestBinSymbol(returnsOverride);
  const set = new Set<string>([...SPECIAL_BIN_BARCODES]);
  if (returns) set.add(returns);
  return [...set];
}

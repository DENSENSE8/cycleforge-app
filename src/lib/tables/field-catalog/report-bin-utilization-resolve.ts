/** Bin-utilization slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { BinUtilizationReportRow } from '@/lib/reports/report-rows';

/** The bin's fill as a whole percentage, or `null` when the MV has no ratio for it (a bin with no declared capacity). */
export function binFillPercent(row: BinUtilizationReportRow): number | null {
  if (row.fill_ratio === null) return null;
  return Number((row.fill_ratio * 100).toFixed(0));
}

/** The bin's scannable handle — the retired Bin cell's `barcode ?? bin_name`. */
export function binHandle(row: BinUtilizationReportRow): string | null {
  return row.barcode ?? row.bin_name;
}

export function resolveReportBinUtilizationSlotValue(
  row: BinUtilizationReportRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'report-bin-utilization.bin':
      return { kind: 'value', text: binHandle(row) };
    case 'report-bin-utilization.room':
      return { kind: 'value', text: row.room };
    case 'report-bin-utilization.fill': {
      const percent = binFillPercent(row);
      return { kind: 'value', text: percent === null ? null : String(percent) };
    }
    case 'report-bin-utilization.in_bin':
      return { kind: 'value', text: String(row.in_bin) };
    case 'report-bin-utilization.capacity':
      return {
        kind: 'value',
        text: row.capacity === null ? null : String(row.capacity),
      };
    case 'report-bin-utilization.sku_count':
      return { kind: 'value', text: String(row.sku_count) };
    default:
      return null;
  }
}

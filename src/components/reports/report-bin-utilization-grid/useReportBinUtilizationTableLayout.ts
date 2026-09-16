'use client';

/**
 * The bin-utilization slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell has nothing to paint into — `paintMorph` coerces, and
 * the org write gate (`slotMorphsFor('report-bin-utilization')`) refuses the
 * foreign morph.
 *
 * The Fields menu keys off `tableId`, so `/reports` gets the RIGHT picker per
 * tab for free: each of the three reports mounts its own family, so the popover
 * that opens over Bin Utilization lists bin facts and the one over Velocity
 * lists movement facts, with no per-tab branch anywhere. That is the whole
 * reason the three reports are three tableIds rather than one.
 */

import {
  REPORT_BIN_UTILIZATION_FIELD_CATALOG,
  REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT,
  REPORT_BIN_UTILIZATION_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-bin-utilization';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReportBinUtilizationTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: REPORT_BIN_UTILIZATION_TABLE_LAYOUT_ID,
    catalog: REPORT_BIN_UTILIZATION_FIELD_CATALOG,
    productLayout: REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Bin',
    bandLabels: { status: 'Bin columns', subtitle: 'Under the room' },
  });
}

'use client';

/**
 * The SKU-velocity slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell has nothing to paint into — `paintMorph` coerces, and
 * the org write gate (`slotMorphsFor('report-velocity')`) refuses the foreign
 * morph.
 *
 * The Fields menu keys off `tableId`, so `/reports` gets the RIGHT picker per
 * tab for free: each of the three reports mounts its own family, so the popover
 * that opens over Velocity lists movement facts and the one over Dead stock
 * lists dormancy facts, with no per-tab branch anywhere.
 */

import {
  REPORT_VELOCITY_FIELD_CATALOG,
  REPORT_VELOCITY_PRODUCT_LAYOUT,
  REPORT_VELOCITY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-velocity';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReportVelocityTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: REPORT_VELOCITY_TABLE_LAYOUT_ID,
    catalog: REPORT_VELOCITY_FIELD_CATALOG,
    productLayout: REPORT_VELOCITY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Velocity columns', subtitle: 'Under the product' },
  });
}

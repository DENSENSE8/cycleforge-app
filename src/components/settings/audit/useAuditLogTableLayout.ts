'use client';

/**
 * The audit-log slot-layout hook — the log's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org write
 * gate (`slotMorphsFor('audit-log')`) refuses the foreign morph.
 */

import {
  AUDIT_LOG_FIELD_CATALOG,
  AUDIT_LOG_PRODUCT_LAYOUT,
  AUDIT_LOG_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/audit-log';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAuditLogTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: AUDIT_LOG_TABLE_LAYOUT_ID,
    catalog: AUDIT_LOG_FIELD_CATALOG,
    productLayout: AUDIT_LOG_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Entity',
    bandLabels: { status: 'Entry columns', subtitle: 'Under the title' },
  });
}

'use client';

/** The audit-log slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  AUDITLOG_FIELD_CATALOG,
  AUDITLOG_PRODUCT_LAYOUT,
  AUDITLOG_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/audit-log';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAuditLogTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: AUDITLOG_TABLE_LAYOUT_ID,
    catalog: AUDITLOG_FIELD_CATALOG,
    productLayout: AUDITLOG_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Entity id',
    bandLabels: { status: 'Audit columns', subtitle: 'Under the action' },
  });
}

'use client';

/** The drift-alerts slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
  ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT,
  ADMIN_DRIFT_ALERTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-drift-alerts';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAdminDriftAlertsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: ADMIN_DRIFT_ALERTS_TABLE_LAYOUT_ID,
    catalog: ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
    productLayout: ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Alert columns', subtitle: 'Under the detail' },
  });
}

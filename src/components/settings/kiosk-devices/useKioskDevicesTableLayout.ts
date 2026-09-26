'use client';

/** The kiosk devices slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  KIOSKDEVICES_FIELD_CATALOG,
  KIOSKDEVICES_PRODUCT_LAYOUT,
  KIOSKDEVICES_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/kiosk-devices';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useKioskDevicesTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: KIOSKDEVICES_TABLE_LAYOUT_ID,
    catalog: KIOSKDEVICES_FIELD_CATALOG,
    productLayout: KIOSKDEVICES_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Device',
    bandLabels: { status: 'Device columns', subtitle: 'Under the title' },
  });
}

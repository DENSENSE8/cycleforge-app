/**
 * Kiosk cart binding.
 *
 * The cart is transient session data rather than a staff workbench collection,
 * so it is intentionally not added to `PRODUCT_TABLES` or the staff layout
 * hook cohort. It still uses the same validated table definition and grid
 * descriptor as every other DataTable surface.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import {
  CART_COMPOUND_COLUMNS,
  makeKioskCartGridDescriptor,
  type CartGridColumn,
} from '@/lib/kiosk/cart-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';

export const KIOSK_CART_TABLE_DEFINITION = parseTableDefinition({
  id: 'kiosk.cart',
  tableId: 'kiosk-cart',
  entityFamily: 'kiosk',
  cellMapKey: 'kiosk',
  ariaLabel: 'Cart lines',
  testId: 'kiosk-cart-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: {
    rowTriageFlags: false,
    multiSelect: false,
    inCellEdit: false,
    fieldsMenu: false,
    dayBands: false,
  },
  columns: CART_COMPOUND_COLUMNS,
});

export const KIOSK_CART_TABLE_BINDING: TableSurfaceBinding<
  KioskCartLine,
  CartGridColumn
> = {
  definition: KIOSK_CART_TABLE_DEFINITION,
  columns: CART_COMPOUND_COLUMNS,
  makeDescriptor: makeKioskCartGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason: 'The kiosk cart edits session lines inline and submits the visit as one intake.',
  },
};
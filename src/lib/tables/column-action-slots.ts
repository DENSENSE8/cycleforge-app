/**
 * Map selection verbs onto the compound/slot track they edit.
 *
 * The table-foot bulk row paints **in the same CSS grid as the header**, so a
 * download sits under Image, copy under Order, ship-by under STATUS, assign
 * under Pick. Verbs with no column (Listing → staff, product-label print,
 * export) stay on the rail, never as a second toolbar.
 */

export type ColumnActionSlotColumn = {
  key: string;
  fieldId?: string;
};

export function columnKeyForSelectionAction(
  actionKey: string,
  columns: readonly ColumnActionSlotColumn[],
): string | null {
  const has = (key: string) => columns.some((c) => c.key === key);
  switch (actionKey) {
    case 'download-photos':
      return has('thumb') ? 'thumb' : null;
    case 'copy':
      return has('fulfillment') ? 'fulfillment' : null;
    case 'condition':
    case 'qty':
    case 'notes':
      return has('item') ? 'item' : null;
    case 'ship-by':
      return has('state') ? 'state' : null;
    case 'assign':
    case 'assign-pick': {
      const picked = columns.find((c) => c.fieldId === 'orders.picked');
      return picked?.key ?? null;
    }
    case 'assign-pack': {
      const packed = columns.find((c) => c.fieldId === 'orders.packed');
      return packed?.key ?? null;
    }
    case 'scan-out': {
      const scanned = columns.find((c) => c.fieldId === 'orders.scanned_out');
      return scanned?.key ?? null;
    }
    case 'flag':
      return has('actions') ? 'actions' : null;
    default:
      return null;
  }
}

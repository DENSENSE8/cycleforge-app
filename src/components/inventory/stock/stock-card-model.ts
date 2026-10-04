/**
 * Inventory › Stock — the stock family's card model, pure: one card per rack
 * level (`inventory.stock`), turned into the shared card model its view admits
 * ({@link ViewCardModel}). Line 1 reads room · rack … the rack's total on hand
 * · when it was last counted / moved (the DATE status); each product position
 * is a line.
 */

import type { ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import { STOCK_LIFECYCLE } from '@/design-system/tokens/stock-lifecycle';
import { locationStockPositionFace, locationStockRackFace, type LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { stockRecordState, stockRecordTitle } from '@/lib/inventory/stock-record';
import type { INVENTORY_STOCK_VIEW } from '@/lib/triage/views/inventory-stock';
import { formatDateKeyShort, formatDateTimePST, toPSTDateKey } from '@/utils/date';

/** One rack level: its product positions, the lead first. */
export type StockRowModel = { key: string; ids: readonly number[]; lead: LocationStockTableRow; rows: readonly LocationStockTableRow[] };

/** A position's last touch: a bin's last count is the number the floor trusts; a unit placement has none, so its last move stands in. */
export interface StockTouch {
  iso: string;
  verb: 'Counted' | 'Moved';
}

/** The newest count or move across `rows` — null when none has a readable stamp. */
export function stockLastTouch(rows: readonly LocationStockTableRow[]): StockTouch | null {
  const stamps = rows.flatMap((item) => [
    ...(item.last_counted ? [{ iso: item.last_counted, verb: 'Counted' as const }] : []),
    ...(item.last_moved ? [{ iso: item.last_moved, verb: 'Moved' as const }] : []),
  ]);
  const valid = stamps.filter((stamp) => !Number.isNaN(Date.parse(stamp.iso)));
  // Newest wins; on a tie the count does (the number the floor trusts).
  return valid.sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso) || (a.verb === 'Counted' ? -1 : 1))[0] ?? null;
}

/** "Counted Oct 1" — PT, so the server and the browser paint the same day. */
export function stockTouchFace(touch: StockTouch): string {
  return `${touch.verb} ${formatDateKeyShort(toPSTDateKey(touch.iso))}`;
}

/** The rack's total on hand across its positions (a negative count never subtracts). */
export function stockRackTotal(rows: readonly LocationStockTableRow[]): number {
  return rows.reduce((sum, item) => sum + Math.max(0, item.qty), 0);
}

/** The rack level as the shared card reads it. `rowId` is the host's numeric id for a pair. */
export function stockRecordCard(
  model: StockRowModel,
  rowId: (row: LocationStockTableRow) => number,
): ViewCardModel<typeof INVENTORY_STOCK_VIEW> {
  const row = model.lead;
  const title = row.source === 'empty' ? 'Empty location' : stockRecordTitle(row);
  const bin = locationStockRackFace(row);
  const groupStates = model.rows.map(stockRecordState);
  const state =
    STOCK_LIFECYCLE[groupStates.includes('onHold') ? 'onHold' : groupStates.includes('inStock') ? 'inStock' : 'outOfStock'];
  const totalQty = stockRackTotal(model.rows);
  const touch = stockLastTouch(model.rows);
  const positions = `${model.rows.length} product position${model.rows.length === 1 ? '' : 's'}`;
  return {
    key: model.key,
    leadId: rowId(row),
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: state.label,
    alert: null,
    aria: {
      card: `${positions} at ${bin ?? 'no location'}, ${totalQty} on hand`,
      open: row.source === 'empty' ? `Add SKU at ${bin ?? 'no location'}` : `Open ${title} at ${bin ?? 'no location'}`,
      check: `Select ${positions} at ${bin ?? 'no location'}`,
    },
    channel: null,
    person: null,
    chips: [],
    notes: { fixed: null, own: null },
    status: touch
      ? { kind: 'date', face: stockTouchFace(touch), tip: `${touch.verb} ${formatDateTimePST(touch.iso)} PT`, alert: false }
      : { kind: 'date', face: 'Never counted', tip: 'No count or move on record for this rack', alert: false },
    next: null,
    lines: model.rows.map((item) => {
      const position = locationStockPositionFace(item);
      return {
        id: rowId(item),
        title: item.source === 'empty' ? 'Empty location' : stockRecordTitle(item),
        photoUrl: item.image_url,
        facts: {
          qty: { kind: 'count', value: item.qty },
          // The rack face already appears once in the identity. Only a
          // numbered child position adds a second address on its line.
          position: position && position !== bin ? { kind: 'place', path: position, empty: 'No position' } : null,
          sku: { kind: 'code', text: item.sku || 'Add SKU', title: item.sku ? `SKU ${item.sku}` : 'Add a SKU' },
        },
        alert: false,
        alertNote: null,
      };
    }),
    hiddenAlertLabel: () => '',
  };
}

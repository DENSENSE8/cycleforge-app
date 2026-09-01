/**
 * Products-catalog slot resolvers — row + fieldId → the resolved fact a slot
 * cell paints. Pure functions; no React, no hooks.
 *
 * Presentation faces (the inventory linkage chip, the status pill) stay in the
 * family's cell map — this module answers WHAT the fact says, in display text.
 *
 * Roll-up counts resolve to `null` at zero rather than `0`. A product with no
 * channels is one nobody has listed yet, and a column of zeros is the fake-`0`
 * the honest-absence law names: it reads as a measured result rather than as
 * "nothing here to measure".
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { CatalogListRow } from '@/components/products/catalog/types';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** A roll-up count — blank at zero, so the column carries signal, not noise. */
function countText(value: number | null | undefined): string | null {
  return value != null && value > 0 ? String(value) : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveCatalogSlotValue(
  row: CatalogListRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'catalog.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'catalog.inventory':
      // The FACT is which inventory record this product is wired to. An
      // unlinked product resolves null — the cell paints its "link me" face,
      // and a bound column must not invent a name for a link that is missing.
      return {
        kind: 'value',
        text: row.is_inventory_linked
          ? (str(row.inventory_title) ?? str(row.provider_item_id))
          : null,
      };
    case 'catalog.channels':
      return { kind: 'value', text: countText(row.platform_count) };
    case 'catalog.manuals':
      return { kind: 'value', text: countText(row.manual_count) };
    case 'catalog.qc':
      return { kind: 'value', text: countText(row.qc_step_count) };
    case 'catalog.orders':
      return { kind: 'value', text: countText(row.order_count) };
    case 'catalog.status':
      // What has HAPPENED to the product, in the order an operator triages:
      // something waiting on a human first, then retired, then live.
      return {
        kind: 'value',
        text: row.has_pending_action
          ? 'Needs attention'
          : !row.is_active
            ? 'Inactive'
            : (str(row.lifecycle_status) ?? 'Active'),
      };
    case 'catalog.cost': {
      // `numeric` cents → `$N.NN`. Null stays null: a product nobody has bought
      // yet has no cost, which is not the same as costing nothing.
      const cents = row.last_known_cost_cents;
      return {
        kind: 'value',
        text: cents == null ? null : `$${(cents / 100).toFixed(2)}`,
      };
    }
    case 'catalog.category':
      return { kind: 'value', text: str(row.category) };
    default:
      return null;
  }
}

/** Products-catalog slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

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
    case 'catalog.title':
      return { kind: 'value', text: str(row.display_title) ?? str(row.product_title) };
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
    case 'catalog.platforms':
      return {
        kind: 'value',
        text: [...new Set((row.platform_ids ?? []).map((entry) => str(entry.platform)).filter(Boolean))].join(', ') || null,
      };
    case 'catalog.item_numbers':
      return {
        kind: 'value',
        text: (row.platform_ids ?? [])
          .flatMap((entry) => [str(entry.platform_sku), str(entry.platform_item_id)])
          .filter(Boolean)
          .join(', ') || null,
      };
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

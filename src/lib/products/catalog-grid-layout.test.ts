import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { compareCatalogGridRows } from './catalog-grid-layout';

function row(partial: Partial<CatalogListRow> & Pick<CatalogListRow, 'id' | 'sku'>): CatalogListRow {
  return {
    product_title: partial.sku,
    category: null,
    image_url: null,
    is_active: true,
    lifecycle_status: 'active',
    reorder_threshold: null,
    last_known_cost_cents: null,
    platform_count: 0,
    manual_count: 0,
    qc_step_count: 0,
    order_count: 0,
    provider_item_id: null,
    inventory_title: null,
    is_inventory_linked: false,
    has_pending_action: false,
    display_title: partial.sku,
    ...partial,
  };
}

describe('compareCatalogGridRows', () => {
  it('sorts title ascending', () => {
    const a = row({ id: 1, sku: 'B', display_title: 'Beta' });
    const b = row({ id: 2, sku: 'A', display_title: 'Alpha' });
    assert.ok(compareCatalogGridRows(a, b, 'title', 'asc') > 0);
    assert.ok(compareCatalogGridRows(a, b, 'title', 'desc') < 0);
  });

  it('sorts orders descending by default sense', () => {
    const a = row({ id: 1, sku: 'a', order_count: 10 });
    const b = row({ id: 2, sku: 'b', order_count: 2 });
    assert.ok(compareCatalogGridRows(a, b, 'orders', 'desc') < 0);
  });
});

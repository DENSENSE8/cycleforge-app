/**
 * Tests for morphing OOS picker decisions + Pending toast targets.
 * Callers: MorphingRowActionMenu, ordersItemStatus. User: OOS identity plan.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  morphingListingIdentity,
  morphingOosIsFoldSelection,
  morphingOosStartView,
  morphingOosStaysPacked,
} from '@/lib/outbound/morphing-oos';
import {
  OOS_PENDING_TOAST_DURATION_MS,
  pendingDeskHref,
} from '@/lib/outbound/oos-pending-toast';
import { SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';
import { ordersGroupItemStatus, ordersItemStatus } from '@/lib/orders/orders-compound-view';

describe('morphing-oos', () => {
  it('detects fold selection on the same order_id', () => {
    assert.equal(
      morphingOosIsFoldSelection([
        { id: 1, order_id: 'A' },
        { id: 2, order_id: 'A' },
      ]),
      true,
    );
    assert.equal(
      morphingOosIsFoldSelection([
        { id: 1, order_id: 'A' },
        { id: 2, order_id: 'B' },
      ]),
      false,
    );
  });

  it('starts on oos-pick for a fold or single line, commit-multi for distinct leaves', () => {
    assert.equal(
      morphingOosStartView([
        { id: 1, order_id: 'A', sku_catalog_id: 9 },
        { id: 2, order_id: 'A', sku_catalog_id: 9 },
      ]),
      'oos-pick',
    );
    assert.equal(
      morphingOosStartView([
        { id: 1, order_id: 'A' },
        { id: 2, order_id: 'B' },
      ]),
      'commit-multi',
    );
    assert.equal(
      morphingOosStartView([{ id: 1, order_id: 'A', sku_catalog_id: 9 }]),
      'oos-pick',
    );
    assert.equal(morphingOosStartView([{ id: 1, order_id: 'A' }]), 'oos-pick');
  });

  it('staysPacked when every row has packed_at', () => {
    assert.equal(morphingOosStaysPacked([{ packed_at: '2026-09-10' }]), true);
    assert.equal(morphingOosStaysPacked([{ packed_at: null }]), false);
  });

  it('builds listing identity from the row', () => {
    const id = morphingListingIdentity({
      sku: 'SKU',
      product_title: 'Title',
      sku_catalog_id: 4,
      quantity: '2',
    });
    assert.equal(id.kind, 'listing');
    assert.equal(id.sku, 'SKU');
    assert.equal(id.qtyShort, 2);
  });
});

describe('oos-pending-toast', () => {
  it('targets the Shipping Pending desk with a long enough duration', () => {
    assert.equal(pendingDeskHref(), SHIPPING_SHORTAGE_PATH);
    assert.ok(OOS_PENDING_TOAST_DURATION_MS >= 6000);
  });
});

describe('ordersItemStatus shortage card', () => {
  it('attaches a product card for OOS', () => {
    const status = ordersItemStatus({
      has_exception: false,
      is_out_of_stock: true,
      oos_kind: 'listing',
      oos_sku: 'SKU-9',
      oos_title: 'Widget',
      oos_qty_short: 1,
      sku: 'SKU-9',
      product_title: 'Widget',
      catalog_image_url: 'https://example.com/a.jpg',
      quantity: '1',
    });
    assert.equal(status?.label, 'Out of stock');
    assert.equal(status?.card?.sku, 'SKU-9');
    assert.equal(status?.card?.kind, 'listing');
  });

  it('rolls up short lines on the fold parent', () => {
    const status = ordersGroupItemStatus([
      {
        is_out_of_stock: true,
        has_exception: false,
        oos_sku: 'A',
        product_title: 'One',
        catalog_image_url: null,
      },
      {
        is_out_of_stock: false,
        has_exception: false,
        sku: 'B',
        product_title: 'Two',
        catalog_image_url: null,
      },
    ]);
    assert.equal(status?.card?.kind, 'rollup');
    assert.equal(status?.card?.qtyShort, 1);
    assert.deepEqual(status?.card?.rollupSkus, ['A']);
  });

  it('paints Ordered when replenishment has a PO', () => {
    const status = ordersItemStatus({
      has_exception: false,
      is_out_of_stock: true,
      oos_kind: 'listing',
      oos_sku: 'SKU-9',
      oos_title: 'Widget',
      oos_qty_short: 1,
      sku: 'SKU-9',
      product_title: 'Widget',
      catalog_image_url: null,
      quantity: '1',
      replenishment_status: 'po_created',
      replenishment_po_number: 'PO-1234',
    });
    assert.equal(status?.label, 'Ordered · PO PO-1234');
    assert.equal(status?.card?.pipelineLabel, 'Ordered · PO PO-1234');
  });
});

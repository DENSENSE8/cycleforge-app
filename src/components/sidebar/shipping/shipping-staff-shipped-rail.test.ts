import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Order } from '@/components/station/upnext/upnext-types';
import {
  normalizeShippedRailStatus,
  recentOrderToShippedRow,
} from '@/components/sidebar/shipping/shipping-rail-shared';
import {
  shippedOutRailTitle,
  shippedOutToDenseRailVM,
} from '@/components/sidebar/shipping/shipped-out-rail-vm';

describe('normalizeShippedRailStatus', () => {
  it('preserves SHIPPED and maps empty to SHIPPED', () => {
    assert.equal(normalizeShippedRailStatus('SHIPPED_EXT'), 'SHIPPED_EXT');
    assert.equal(normalizeShippedRailStatus(null, true), 'SHIPPED');
    assert.equal(normalizeShippedRailStatus(''), 'SHIPPED');
  });
});

describe('recentOrderToShippedRow', () => {
  it('stamps personal ship-outs as SHIPPED', () => {
    const row = recentOrderToShippedRow({
      id: 1,
      order_id: 'ORD-1',
      product_title: 'Widget',
      item_number: null,
      sku: 'SKU',
      quantity: 1,
      account_source: 'Amazon',
      condition: 'Used',
      tracking_number: '1Z',
      is_shipped: true,
      status: null,
      ship_by_date: null,
      ship_confirmed_at: '2026-07-15T12:00:00Z',
      created_at: '2026-07-01T12:00:00Z',
    });
    assert.equal(row.status, 'SHIPPED');
    assert.equal(row.is_shipped, true);
  });
});

describe('shippedOutToDenseRailVM', () => {
  const order: Order = {
    id: 1,
    ship_by_date: null,
    created_at: '2026-07-15T12:00:00Z',
    order_id: 'ORD-1',
    product_title: '',
    item_number: null,
    account_source: 'Amazon',
    sku: 'SKU',
    condition: null,
    quantity: '1',
    status: 'SHIPPED',
    shipping_tracking_number: '1Z',
    out_of_stock: null,
    is_shipped: true,
  };

  it('uses Testing-parity title + meta only (no eyebrow)', () => {
    assert.equal(shippedOutRailTitle(order), 'Unknown Product');
    const vm = shippedOutToDenseRailVM(order);
    assert.equal(vm.title, 'Unknown Product');
    assert.equal(vm.eyebrow, undefined);
    assert.equal(vm.eyebrowTrailing, undefined);
    assert.ok(vm.meta != null);
  });
});

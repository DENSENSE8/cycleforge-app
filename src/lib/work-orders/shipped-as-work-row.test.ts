/**
 *   npx tsx --test src/lib/work-orders/shipped-as-work-row.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShippedOrder } from '@/types/orders';
import { shippedOrderAsWorkRow } from './shipped-as-work-row';

function order(over: Partial<ShippedOrder> & Pick<ShippedOrder, 'id'>): ShippedOrder {
  return {
    order_id: 'CF-1001',
    product_title: 'Trail bike',
    condition: 'Used',
    serial_number: '',
    sku: 'SKU-1',
    tested_by: null,
    test_date_time: null,
    packer_id: null,
    packed_by: null,
    packed_at: null,
    packer_photos_url: null,
    tracking_type: null,
    account_source: null,
    notes: '',
    is_shipped: false,
    is_out_of_stock: false,
    created_at: null,
    status_history: null,
    ...over,
  } as ShippedOrder;
}

describe('shippedOrderAsWorkRow', () => {
  it('prefers the exact SLA deadline over date-only ship-by fallback', () => {
    const row = shippedOrderAsWorkRow(
      order({
        id: 7,
        ship_by_date: '2026-09-02',
        deadline_at: '2026-08-01',
      }),
    );
    assert.equal(row.entityType, 'ORDER');
    assert.equal(row.entityId, 7);
    assert.equal(row.deadlineAt, '2026-08-01');
    assert.equal(row.orderId, 'CF-1001');
    assert.equal(row.recordLabel, 'CF-1001');
    assert.equal(row.title, 'Trail bike');
    assert.equal(row.status, 'OPEN');
    assert.equal(row.outOfStock, null);
  });

  it('maps catalog listing image onto the work-row thumb', () => {
    const row = shippedOrderAsWorkRow(
      order({ id: 4, catalog_image_url: 'https://cdn.example/bike.jpg' }),
    );
    assert.equal(row.imageUrl, 'https://cdn.example/bike.jpg');
  });

  it('keeps the backend fulfillment channel for online versus physical routing', () => {
    const pickup = shippedOrderAsWorkRow(order({ id: 44, fulfillment_channel: 'PICKUP' }));
    const online = shippedOrderAsWorkRow(order({ id: 45, fulfillment_channel: 'MFN' }));
    assert.equal(pickup.fulfillmentChannel, 'PICKUP');
    assert.equal(online.fulfillmentChannel, 'MFN');
  });

  it('maps server-derived allocation progress and every allocated location', () => {
    const row = shippedOrderAsWorkRow(
      order({
        id: 41,
        allocated_unit_count: 3,
        picked_unit_count: 2,
        storage_locations: [{ zoneLetter: 'B', rowLabel: '04', barcode: 'S4' }],
      }),
    );
    assert.equal(row.allocatedUnitCount, 3);
    assert.equal(row.pickedUnitCount, 2);
    assert.deepEqual(row.storageLocations, [{ zoneLetter: 'B', rowLabel: '04', barcode: 'S4' }]);
  });

  it('normalizes catalog-owned handling facts onto the governed row', () => {
    const row = shippedOrderAsWorkRow(
      order({ id: 42, catalog_handling_flags: ['hazmat', 'two_person_lift'] }),
    );
    assert.deepEqual(row.handlingFacts, ['hazmat', 'two_person_lift']);
  });

  it('maps sale amount onto the work-row price face', () => {
    const row = shippedOrderAsWorkRow(
      order({ id: 6, sale_amount: '49.99', currency: 'USD' }),
    );
    assert.equal(row.saleAmount, '49.99');
    assert.equal(row.currency, 'USD');
  });

  it('maps catalog category and serial onto the work-row search fields', () => {
    const row = shippedOrderAsWorkRow(
      order({
        id: 5,
        catalog_category: 'Frames',
        serial_number: 'SN-9',
      }),
    );
    assert.equal(row.catalogCategory, 'Frames');
    assert.equal(row.serialNumber, 'SN-9');
  });

  it('maps is_out_of_stock onto the work-row outOfStock face', () => {
    const row = shippedOrderAsWorkRow(order({ id: 3, is_out_of_stock: true }));
    assert.equal(row.outOfStock, 'Out of stock');
  });

  it('marks packer or picker assignment as ASSIGNED', () => {
    assert.equal(shippedOrderAsWorkRow(order({ id: 1, packer_id: 9 })).status, 'ASSIGNED');
    assert.equal(shippedOrderAsWorkRow(order({ id: 2, picker_id: 3 })).status, 'ASSIGNED');
  });

  it('maps the picker and its colour onto the phone Pick mark', () => {
    const row = shippedOrderAsWorkRow(
      order({
        id: 8,
        picker_id: 4,
        picker_name: 'Sang',
        picker_color_hex: '#E11D48',
        packer_id: 3,
        packer_name: 'Tuan',
        packer_color_hex: '#2563EB',
      }),
    );
    assert.equal(row.techId, 4);
    assert.equal(row.techName, 'Sang');
    assert.equal(row.techColorHex, '#e11d48');
    assert.equal(row.packerColorHex, '#2563eb');
    assert.equal(row.packerName, 'Tuan');
  });
});

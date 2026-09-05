import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  orderBoxCountLabel,
  orderCarrierBoxes,
  uniqueOrderTrackings,
} from '@/lib/orders/order-group-identity';
import type { ShippedOrder } from '@/types/orders';

function line(over: Partial<ShippedOrder> = {}): ShippedOrder {
  return {
    id: 1,
    order_id: '111-2222222-3333333',
    product_title: 'Widget',
    shipping_tracking_number: null,
    tracking_numbers: null,
    ...over,
  } as ShippedOrder;
}

describe('uniqueOrderTrackings', () => {
  it('lists first-seen numbers across every line', () => {
    assert.deepEqual(
      uniqueOrderTrackings([
        line({ tracking_numbers: ['1ZAAA', '1ZBBB'] }),
        line({ id: 2, tracking_numbers: ['1ZBBB', '1ZCCC'] }),
      ]),
      ['1ZAAA', '1ZBBB', '1ZCCC'],
    );
  });

  it('falls back to the primary tracking field when the array is empty', () => {
    assert.deepEqual(
      uniqueOrderTrackings([line({ shipping_tracking_number: '1ZPRIMARY' })]),
      ['1ZPRIMARY'],
    );
  });

  it('reads the legacy tracking_number alias', () => {
    const row = line({ shipping_tracking_number: null }) as ShippedOrder & {
      tracking_number?: string | null;
    };
    row.tracking_number = '1ZLEGACY';
    assert.deepEqual(uniqueOrderTrackings([row]), ['1ZLEGACY']);
  });

  it('skips blanks', () => {
    assert.deepEqual(
      uniqueOrderTrackings([
        line({ tracking_numbers: ['', '  ', '1ZKEEP'] }),
        line({ id: 2, shipping_tracking_number: '' }),
      ]),
      ['1ZKEEP'],
    );
  });
});

describe('orderCarrierBoxes', () => {
  it('paints ONE dot per distinct carrier, not one per tracking number', () => {
    // Two UPS boxes + one USPS box = two dots, three boxes.
    const { carriers, boxCount } = orderCarrierBoxes([
      line({ tracking_numbers: ['1Z999AA10123456784', '1Z999AA10123456795'] }),
      line({ id: 2, tracking_numbers: ['9400111899223197428490'] }),
    ]);
    assert.equal(boxCount, 3);
    assert.deepEqual(
      carriers.map((c) => c.carrier),
      ['UPS', 'USPS'],
    );
  });

  it('carries a brand hex for each known carrier so the dots differ', () => {
    const { carriers } = orderCarrierBoxes([
      line({ tracking_numbers: ['1Z999AA10123456784', '9400111899223197428490'] }),
    ]);
    const hexes = carriers.map((c) => c.brandHex);
    assert.equal(new Set(hexes).size, hexes.length, 'each carrier dot must be its own colour');
    assert.ok(hexes.every((h) => typeof h === 'string' && h.length > 0));
  });

  it('reports zero boxes and no dots when the fold has no tracking', () => {
    assert.deepEqual(orderCarrierBoxes([line(), line({ id: 2 })]), {
      carriers: [],
      boxCount: 0,
      trackings: [],
    });
  });
});

describe('orderBoxCountLabel', () => {
  it('says boxes, never lines', () => {
    assert.equal(orderBoxCountLabel(2), '2 boxes');
    assert.equal(orderBoxCountLabel(0), '0 boxes');
  });

  it('singularises one box', () => {
    assert.equal(orderBoxCountLabel(1), '1 box');
  });
});

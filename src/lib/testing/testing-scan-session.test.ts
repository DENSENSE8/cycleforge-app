import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_TESTING_SCAN_SESSION,
  testingScanSessionReducer,
  unitBelongsToAnchor,
} from './testing-scan-session';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

function line(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 10,
    receiving_id: 100,
    sku: 'SKU-1',
    item_name: 'Widget',
    tracking_number: '1Z999AA10123456784',
    serials: [
      { id: 1, serial_number: 'SN-AAA', unit_uid: 'SKU1-2621-000001' },
      { id: 2, serial_number: 'SN-BBB', unit_uid: 'SKU1-2621-000002' },
    ],
    ...overrides,
  } as ReceivingLineRow;
}

describe('testingScanSessionReducer', () => {
  it('anchors on tracking then confirms unit', () => {
    let s = INITIAL_TESTING_SCAN_SESSION;
    s = testingScanSessionReducer(s, {
      type: 'ANCHOR_TRACKING',
      trackingRef: '1Z999AA10123456784',
      line: line(),
      via: 'tracking',
    });
    assert.equal(s.phase, 'anchored');
    assert.equal(s.trackingRef, '1Z999AA10123456784');

    s = testingScanSessionReducer(s, {
      type: 'CONFIRM_UNIT',
      unitKey: 'SKU1-2621-000001',
      line: line(),
      via: 'unit_id',
    });
    assert.equal(s.phase, 'confirmed');
    assert.equal(s.unitKey, 'SKU1-2621-000001');
  });
});

describe('unitBelongsToAnchor', () => {
  it('matches same line id or same receiving carton', () => {
    assert.equal(unitBelongsToAnchor(line(), line({ id: 10 })), true);
    assert.equal(unitBelongsToAnchor(line(), line({ id: 99, receiving_id: 100 })), true);
    assert.equal(
      unitBelongsToAnchor(line(), line({ id: 99, receiving_id: 200, tracking_number: 'OTHER' })),
      false,
    );
  });
});

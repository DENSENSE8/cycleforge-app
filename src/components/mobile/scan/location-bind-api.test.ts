import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationRecordFromWire } from './location-bind-api';

test('locationRecordFromWire keeps stock rows with units or a provisional placeholder, and real containers only', () => {
  const record = locationRecordFromWire('C0101101', 'C-01-01-1-01', {
    location: { id: 7, room: '  Zone C  ' },
    contents: [
      { sku: 'HELD', qty: 2, photoIds: [3, 0, -1, 4] },
      { sku: 'EMPTY', qty: 0 },
      { sku: 'PLACEHOLDER', qty: 0, isProvisional: true },
      { qty: 5 },
    ],
    handlingUnits: [
      { id: 0, code: 'LPN-0' },
      { id: 9, code: '' },
      { id: 12, code: 'LPN-12', totalUnits: 3 },
    ],
    walk: { position: 0, total: 4 },
  });

  assert.equal(record.id, 7);
  assert.equal(record.room, 'Zone C');
  assert.deepEqual(record.contents.map((c) => c.sku), ['HELD', 'PLACEHOLDER']);
  assert.deepEqual(record.contents[0].photoIds, [3, 4]);
  assert.deepEqual(record.handlingUnits.map((u) => [u.id, u.status, u.totalUnits]), [[12, 'OPEN', 3]]);
  assert.equal(record.walk, null);
});

test('locationRecordFromWire reads a 1-based walk step and blank neighbours as none', () => {
  const record = locationRecordFromWire('C0101101', 'C-01-01-1-01', {
    location: null,
    walk: { position: 1, total: 3, previous: '  ', next: 'C0101102' },
  });

  assert.equal(record.id, null);
  assert.equal(record.room, null);
  assert.deepEqual(record.walk, { position: 1, total: 3, previous: null, next: 'C0101102' });
});

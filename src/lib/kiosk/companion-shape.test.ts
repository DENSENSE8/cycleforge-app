import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeCompanionDevices, queueCompanionSerial } from './companion-shape';

const unit = (lineId: string, serialNumber = '') => ({ lineId, title: 'Wave', sku: '00004-RS', serialNumber });

describe('phone companion serials', () => {
  it('a scan the tablet has not applied yet wins over its stale snapshot', () => {
    const merged = mergeCompanionDevices([unit('a'), unit('b', 'TYPED')], [{ lineId: 'a', serialNumber: 'SCANNED' }]);
    assert.deepEqual(merged.map((d) => d.serialNumber), ['SCANNED', 'TYPED']);
  });

  it('a scan for a unit the tablet removed goes nowhere', () => {
    const merged = mergeCompanionDevices([unit('b')], [{ lineId: 'a', serialNumber: 'SCANNED' }]);
    assert.deepEqual(merged, [unit('b')]);
  });

  it('a rescan of the same unit replaces the one still in flight', () => {
    const queued = queueCompanionSerial([{ lineId: 'a', serialNumber: 'WRONG' }], { lineId: 'a', serialNumber: 'RIGHT' });
    assert.deepEqual(queued, [{ lineId: 'a', serialNumber: 'RIGHT' }]);
  });
});

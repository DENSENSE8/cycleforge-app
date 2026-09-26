import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { layPhoneWrites, mergeCompanionDevices, queueCompanionSerial } from './companion-shape';

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

  it('a second write for the same unit replaces the one in flight — the list, not a concatenation', () => {
    const queued = queueCompanionSerial([{ lineId: 'a', serialNumber: 'WAVE01' }], { lineId: 'a', serialNumber: 'WAVE01, CDX-778' });
    assert.deepEqual(queued, [{ lineId: 'a', serialNumber: 'WAVE01, CDX-778' }]);
    assert.deepEqual(mergeCompanionDevices([unit('a')], queued).map((d) => d.serialNumber), ['WAVE01, CDX-778']);
  });
});

describe('the phone laying its own writes over a snapshot', () => {
  const write = { lineId: 'a', serialNumber: 'WAVE01, CDX-778', at: 1_000 };

  it('a poll that left before the write cannot put the old list back', () => {
    const { devices, unsettled } = layPhoneWrites([unit('a', 'WAVE01'), unit('b')], [write], 900);
    assert.deepEqual(devices.map((d) => d.serialNumber), ['WAVE01, CDX-778', '']);
    assert.deepEqual(unsettled, [write]);
  });

  it('a later snapshot showing the same list settles the write', () => {
    const { devices, unsettled } = layPhoneWrites([unit('a', 'wave01, cdx-778')], [write], 1_200);
    assert.deepEqual(devices.map((d) => d.serialNumber), ['wave01, cdx-778']);
    assert.deepEqual(unsettled, []);
  });

  it('a later snapshot that disagrees is outranked until the hold runs out, then the tablet wins', () => {
    assert.equal(layPhoneWrites([unit('a', 'WAVE01')], [write], 3_000, 5_000).devices[0].serialNumber, 'WAVE01, CDX-778');
    const late = layPhoneWrites([unit('a', 'WAVE01')], [write], 6_000, 5_000);
    assert.equal(late.devices[0].serialNumber, 'WAVE01');
    assert.deepEqual(late.unsettled, []);
  });

  it('a write for a unit the tablet removed is dropped', () => {
    assert.deepEqual(layPhoneWrites([unit('b')], [write], 900), { devices: [unit('b')], unsettled: [] });
  });
});

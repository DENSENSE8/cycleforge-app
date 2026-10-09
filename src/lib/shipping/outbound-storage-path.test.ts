import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOutboundStoragePath } from './outbound-storage-path';

test('formats the allocated location as a warehouse breadcrumb ending in the bare bin code', () => {
  assert.equal(
    formatOutboundStoragePath([{ zoneLetter: 'B', rowLabel: '04', barcode: 'S4' }]),
    'ZONE-B // AISLE-04 // S4',
  );
});

test('the aisle carries the shelf level from colLabel so the picker knows which shelf', () => {
  assert.equal(
    formatOutboundStoragePath([
      { name: 'C-02-01-2', room: 'Zone 3 - Parts', barcode: 'C0201200', colLabel: '2-00', rowLabel: '02-01', zoneLetter: 'C' },
    ]),
    'ZONE-C // AISLE-02-01-2 // C0201200',
  );
});

test('a tote location ends in the tote code itself', () => {
  assert.equal(formatOutboundStoragePath([{ room: 'Staging', barcode: 'H-12' }]), 'Staging // H-12');
});

test('retains multiple allocated bins rather than guessing one', () => {
  assert.equal(
    formatOutboundStoragePath([
      { zoneLetter: 'B', rowLabel: '04', barcode: 'S4' },
      { zoneLetter: 'C', rowLabel: '01', barcode: 'A1' },
    ]),
    'ZONE-B // AISLE-04 // S4 | ZONE-C // AISLE-01 // A1',
  );
});

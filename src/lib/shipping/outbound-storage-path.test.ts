import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOutboundStoragePath } from './outbound-storage-path';

test('formats the allocated location as a warehouse breadcrumb', () => {
  assert.equal(
    formatOutboundStoragePath([{ zoneLetter: 'B', rowLabel: '04', barcode: 'S4' }]),
    'ZONE-B // AISLE-04 // BIN-S4',
  );
});

test('retains multiple allocated bins rather than guessing one', () => {
  assert.equal(
    formatOutboundStoragePath([
      { zoneLetter: 'B', rowLabel: '04', barcode: 'S4' },
      { zoneLetter: 'C', rowLabel: '01', barcode: 'A1' },
    ]),
    'ZONE-B // AISLE-04 // BIN-S4 | ZONE-C // AISLE-01 // BIN-A1',
  );
});

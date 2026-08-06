import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  classifyHistoryCommandScan,
  type HistoryCommandScanKind,
} from './history-command-scan';
import type { ScanRoute } from '@/lib/barcode-routing';

describe('classifyHistoryCommandScan', () => {
  test('CMD-* stickers are station_command', () => {
    const hit: HistoryCommandScanKind = classifyHistoryCommandScan('CMD-BATCH-SORT');
    assert.equal(hit.kind, 'station_command');
    if (hit.kind === 'station_command') {
      assert.equal(hit.code, 'CMD-BATCH-SORT');
    }
  });

  test('FIELD:value barcodes set exact-match field find', () => {
    const hit = classifyHistoryCommandScan('PO:4500123');
    assert.deepEqual(hit, { kind: 'field', field: 'po', value: '4500123' });
  });

  test('receiving handle opens carton', () => {
    const route: ScanRoute = {
      type: 'receiving',
      value: '50297',
      redirect: '/m/r/50297',
    };
    const hit = classifyHistoryCommandScan('R-50297', route);
    assert.deepEqual(hit, { kind: 'open_carton', receivingId: 50297 });
  });

  test('bin / unit handles passthrough', () => {
    const route: ScanRoute = { type: 'bin', value: 'A0101101', redirect: '/inventory?bin=A0101101' };
    const hit = classifyHistoryCommandScan('A0101101', route);
    assert.equal(hit.kind, 'passthrough');
  });

  test('bare SKU / tracking text is find', () => {
    const hit = classifyHistoryCommandScan('1Z999AA10123456784');
    assert.deepEqual(hit, { kind: 'find', raw: '1Z999AA10123456784' });
  });
});

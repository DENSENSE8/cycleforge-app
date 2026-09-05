import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { printStationLabel } from '@/lib/print/station-label-print';

describe('printStationLabel', () => {
  it('skips when there is no window (no fake USB success)', async () => {
    const via = await printStationLabel({ kind: 'unit', input: { sku: 'SKU-1' } });
    assert.equal(via, 'skipped');
  });

  it('skips a carton job off-window', async () => {
    const via = await printStationLabel({
      kind: 'carton',
      payload: {
        scanValue: 'PO-1',
        platform: 'eBay',
        notes: '',
        conditionCode: 'NEW',
        date: '09/04/26',
      },
    });
    assert.equal(via, 'skipped');
  });
});

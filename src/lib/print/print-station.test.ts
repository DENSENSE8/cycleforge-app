/**
 * The phone's remembered print-station pick is per org + staffer on a device.
 *
 * Run: node --import tsx --test src/lib/print/print-station.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readRememberedPrintStationId,
  rememberPrintStationId,
  type PrintStationPickStorage,
} from './print-station';

function memoryStorage(): PrintStationPickStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const ORG = '00000000-0000-0000-0000-000000000001';
const OTHER_ORG = '00000000-0000-0000-0000-000000000002';

describe('remembered print station', () => {
  it('keeps each staffer’s pick apart on a shared phone', () => {
    const storage = memoryStorage();
    rememberPrintStationId(storage, ORG, 1, 'ps_bench_a');
    rememberPrintStationId(storage, ORG, 2, 'ps_pack_1');
    assert.equal(readRememberedPrintStationId(storage, ORG, 1), 'ps_bench_a');
    assert.equal(readRememberedPrintStationId(storage, ORG, 2), 'ps_pack_1');
    assert.equal(readRememberedPrintStationId(storage, OTHER_ORG, 1), null);
  });

  it('forgets on a null or blank pick, and a re-pick replaces', () => {
    const storage = memoryStorage();
    rememberPrintStationId(storage, ORG, 1, 'ps_bench_a');
    rememberPrintStationId(storage, ORG, 1, 'ps_pack_1');
    assert.equal(readRememberedPrintStationId(storage, ORG, 1), 'ps_pack_1');
    rememberPrintStationId(storage, ORG, 1, '  ');
    assert.equal(readRememberedPrintStationId(storage, ORG, 1), null);
    rememberPrintStationId(storage, ORG, 1, 'ps_bench_a');
    rememberPrintStationId(storage, ORG, 1, null);
    assert.equal(readRememberedPrintStationId(storage, ORG, 1), null);
  });

  it('keeps a per-stock pick apart from the other stock and from the whole-station pick', () => {
    const storage = memoryStorage();
    rememberPrintStationId(storage, ORG, 1, 'ps_bench_a');
    rememberPrintStationId(storage, ORG, 1, 'ps_thermal', 'label');
    rememberPrintStationId(storage, ORG, 1, 'ps_office', 'paper');
    assert.equal(readRememberedPrintStationId(storage, ORG, 1), 'ps_bench_a');
    assert.equal(readRememberedPrintStationId(storage, ORG, 1, 'label'), 'ps_thermal');
    assert.equal(readRememberedPrintStationId(storage, ORG, 1, 'paper'), 'ps_office');
    rememberPrintStationId(storage, ORG, 1, null, 'label');
    assert.equal(readRememberedPrintStationId(storage, ORG, 1, 'label'), null);
    assert.equal(readRememberedPrintStationId(storage, ORG, 1, 'paper'), 'ps_office');
    assert.equal(readRememberedPrintStationId(storage, ORG, 2, 'paper'), null);
  });

  it('remembers nothing for a signed-out or unscoped owner', () => {
    const storage = memoryStorage();
    rememberPrintStationId(storage, ORG, 0, 'ps_bench_a');
    rememberPrintStationId(storage, '', 1, 'ps_bench_a');
    assert.equal(readRememberedPrintStationId(storage, ORG, 0), null);
    assert.equal(readRememberedPrintStationId(storage, '', 1), null);
    assert.equal(readRememberedPrintStationId(null, ORG, 1), null);
  });

  it('survives a storage that throws (private mode)', () => {
    const broken: PrintStationPickStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    assert.doesNotThrow(() => rememberPrintStationId(broken, ORG, 1, 'ps_bench_a'));
    assert.equal(readRememberedPrintStationId(broken, ORG, 1), null);
  });
});

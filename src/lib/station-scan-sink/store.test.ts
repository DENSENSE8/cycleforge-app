import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetStationScanSinkForTests,
  dispatchScanToActiveSink,
  getActiveSinkId,
  registerScanSink,
  setActiveSinkId,
} from './store';

describe('station-scan-sink store', () => {
  beforeEach(() => {
    __resetStationScanSinkForTests();
  });

  it('dispatches to the active registered sink', () => {
    const seen: string[] = [];
    registerScanSink({
      id: 'a',
      onScan: (v) => {
        seen.push(v);
      },
    });
    assert.equal(getActiveSinkId(), 'a');
    assert.equal(dispatchScanToActiveSink('  SN-1  '), true);
    assert.deepEqual(seen, ['SN-1']);
  });

  it('setActiveSinkId routes without re-register', () => {
    const seen: string[] = [];
    registerScanSink({
      id: 'a',
      onScan: (v) => {
        seen.push(`a:${v}`);
      },
    });
    registerScanSink({
      id: 'b',
      onScan: (v) => {
        seen.push(`b:${v}`);
      },
    });
    assert.equal(getActiveSinkId(), 'b');
    setActiveSinkId('a');
    assert.equal(dispatchScanToActiveSink('X'), true);
    assert.deepEqual(seen, ['a:X']);
  });

  it('unregister falls back to the previous sink', () => {
    const seen: string[] = [];
    registerScanSink({
      id: 'a',
      onScan: (v) => {
        seen.push(`a:${v}`);
      },
    });
    const unregB = registerScanSink({
      id: 'b',
      onScan: (v) => {
        seen.push(`b:${v}`);
      },
    });
    unregB();
    assert.equal(getActiveSinkId(), 'a');
    assert.equal(dispatchScanToActiveSink('Y'), true);
    assert.deepEqual(seen, ['a:Y']);
  });

  it('returns false when no sink is active', () => {
    assert.equal(dispatchScanToActiveSink('Z'), false);
  });

  it('replacing the same id keeps the newer handler', () => {
    const seen: string[] = [];
    const unregOld = registerScanSink({
      id: 'dock',
      onScan: () => {
        seen.push('old');
      },
    });
    registerScanSink({
      id: 'dock',
      onScan: () => {
        seen.push('new');
      },
    });
    // Stale cleanup must not delete the replacement.
    unregOld();
    assert.equal(dispatchScanToActiveSink('Q'), true);
    assert.deepEqual(seen, ['new']);
  });
});

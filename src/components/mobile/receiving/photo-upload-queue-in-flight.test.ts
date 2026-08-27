/**
 * Pure in-flight count law for desk peek placeholders.
 * Failed/done are excluded so a stuck retry does not leave eternal ghosts.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countInFlightEntries,
  type InFlightUploadEntry,
  type InFlightUploadState,
} from './photo-upload-in-flight';

function entry(receivingId: number, state: InFlightUploadState): InFlightUploadEntry {
  return {
    scope: { receivingId },
    state,
  };
}

describe('countInFlightEntries', () => {
  it('counts queued + uploading for the carton only', () => {
    const rows = [
      entry(1, 'queued'),
      entry(1, 'uploading'),
      entry(1, 'done'),
      entry(1, 'failed'),
      entry(2, 'queued'),
    ];
    assert.equal(countInFlightEntries(rows, 1), 2);
    assert.equal(countInFlightEntries(rows, 2), 1);
    assert.equal(countInFlightEntries(rows, 99), 0);
  });

  it('rejects non-finite receiving ids', () => {
    assert.equal(countInFlightEntries([entry(1, 'queued')], NaN), 0);
    assert.equal(countInFlightEntries([entry(1, 'queued')], 0), 0);
  });
});

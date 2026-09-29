import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receivingPackageIds } from './receiving-selection';

describe('receivingPackageIds', () => {
  it('deduplicates selected lines that belong to the same package', () => {
    assert.deepEqual(
      receivingPackageIds([
        { receiving_id: 42 },
        { receiving_id: 42 },
        { receiving_id: 91 },
      ]),
      [42, 91],
    );
  });

  it('drops synthetic and unlinked rows before a package mutation', () => {
    assert.deepEqual(
      receivingPackageIds([
        { receiving_id: null },
        {},
        { receiving_id: 0 },
        { receiving_id: Number.NaN },
        { receiving_id: 7 },
      ]),
      [7],
    );
  });
});

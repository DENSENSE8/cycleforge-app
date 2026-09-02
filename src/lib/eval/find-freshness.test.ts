/**
 * Location gate for cohort graph find — engine file, not matches[0].
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideFind, pickFindMatch } from './find-freshness';

const COMPOUND = 'src/components/tables/compound/CompoundCells.tsx';
const FILTER = 'src/components/tables/DataTable.tsx';

describe('find freshness location gate', () => {
  it('rebuilds when find is empty', () => {
    assert.deepEqual(decideFind([], COMPOUND), { rebuild: true });
  });

  it('passes when expectedFile is empty', () => {
    assert.deepEqual(decideFind([{ location: FILTER, node_key: 'a' }], ''), { ok: true });
  });

  it('fails when every hit is outside the engine file', () => {
    assert.deepEqual(
      decideFind([{ location: FILTER, node_key: 'a' }], COMPOUND),
      { ok: false, reason: 'location' },
    );
  });

  it('passes when the engine file is not matches[0]', () => {
    const matches = [
      { location: FILTER, node_key: 'wrong' },
      { location: `component:${COMPOUND}:CompoundItem`, node_key: 'right' },
    ];
    assert.deepEqual(decideFind(matches, COMPOUND), { ok: true });
    assert.equal(pickFindMatch(matches, COMPOUND)?.node_key, 'right');
  });
});

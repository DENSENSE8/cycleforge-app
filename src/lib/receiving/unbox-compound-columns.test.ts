import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPOUND_COLUMN_KEYS,
  COMPOUND_TRACKS,
} from '@/components/tables/compound/compound-columns';
import {
  RECEIVING_COMPOUND_COLUMNS,
} from '@/lib/receiving/receiving-grid-layout';

describe('compound column model', () => {
  it('derives receiving columns from the shared track grammar', () => {
    assert.deepEqual(
      RECEIVING_COMPOUND_COLUMNS.map((column) => column.key),
      COMPOUND_COLUMN_KEYS,
    );
    assert.equal(RECEIVING_COMPOUND_COLUMNS.length, COMPOUND_TRACKS.length);
  });

  it('ends with the sole 1fr slack track and a contiguous frozen prefix', () => {
    const last = RECEIVING_COMPOUND_COLUMNS.at(-1)!;
    assert.equal(last.key, '_fill');
    assert.equal(RECEIVING_COMPOUND_COLUMNS.filter((column) => String(column.width).includes('1fr')).length, 1);
    const frozen = RECEIVING_COMPOUND_COLUMNS.map((column) => Boolean(column.frozen));
    const firstUnfrozen = frozen.indexOf(false);
    assert.ok(firstUnfrozen > 0);
    assert.ok(!frozen.slice(firstUnfrozen).includes(true));
  });
});
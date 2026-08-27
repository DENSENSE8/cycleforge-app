/**
 * Guard: `type` owns sort semantics, and the blank ruling escapes direction.
 *
 *   npx tsx --test src/design-system/components/grid/grid-column-sort.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareGridValues } from './grid-column-sort';

const asc = { dir: 'asc' as const };
const desc = { dir: 'desc' as const };

describe('compareGridValues — the blank ruling', () => {
  it('sends blanks LAST in BOTH directions', () => {
    // This is the whole point of the module. Orders flipped ±Infinity by
    // direction (blanks last both ways); Receiving used an unflipped +Infinity
    // (blanks TOP under desc). Same concept, opposite ends of the grid.
    for (const type of ['date', 'number', 'price', 'text', 'id']) {
      assert.equal(compareGridValues(null, 5, { ...asc, type }), 1, `${type} asc`);
      assert.equal(compareGridValues(null, 5, { ...desc, type }), 1, `${type} desc`);
      assert.equal(compareGridValues(5, null, { ...asc, type }), -1, `${type} asc`);
      assert.equal(compareGridValues(5, null, { ...desc, type }), -1, `${type} desc`);
    }
  });

  it('treats empty string, whitespace and non-finite numbers as blank', () => {
    for (const blank of ['', '   ', null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(compareGridValues(blank, 'A', asc), 1, String(blank));
    }
  });

  it('two blanks tie, so the caller falls through to its stable key', () => {
    assert.equal(compareGridValues(null, '', asc), 0);
  });
});

describe('compareGridValues — per-type semantics', () => {
  it('numeric types compare as numbers, not strings', () => {
    // '10' vs '9' lexically is backwards; the type is what prevents it.
    assert.ok(compareGridValues(9, 10, { ...asc, type: 'number' }) < 0);
    assert.ok(compareGridValues(10, 9, { ...asc, type: 'price' }) > 0);
  });

  it('date compares as epoch ms — the engine never parses a date string', () => {
    const older = Date.parse('2026-01-01T00:00:00Z');
    const newer = Date.parse('2026-08-20T00:00:00Z');
    assert.ok(compareGridValues(older, newer, { ...asc, type: 'date' }) < 0);
    assert.ok(compareGridValues(older, newer, { ...desc, type: 'date' }) > 0);
  });

  it('id-shaped tracks collate NATURALLY: A-2 before A-10', () => {
    assert.ok(compareGridValues('A-2', 'A-10', { ...asc, type: 'id' }) < 0);
    assert.ok(compareGridValues('BIN-2', 'BIN-10', { ...asc, type: 'location' }) < 0);
    assert.ok(compareGridValues('1Z2', '1Z10', { ...asc, type: 'tracking' }) < 0);
  });

  it('prose collates LEXICALLY and case-blind', () => {
    assert.equal(compareGridValues('apple', 'APPLE', { ...asc, type: 'text' }), 0);
    assert.ok(compareGridValues('apple', 'banana', { ...asc, type: 'text' }) < 0);
  });

  it('direction inverts real values (and only real values)', () => {
    assert.equal(
      compareGridValues(1, 2, { ...asc, type: 'number' }),
      -compareGridValues(1, 2, { ...desc, type: 'number' }),
    );
  });
});

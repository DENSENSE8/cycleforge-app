import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingPhotoPolicy } from '@/lib/settings/accessors';
import {
  deriveReceivingPhotoStageCounts,
  evaluateReceivingPhotoPolicy,
  type EvaluateReceivingPhotoPolicyInput,
  type ReceivingLinePhotoCount,
  type ReceivingPhotoPolicyResult,
} from '@/lib/receiving/photo-policy';

function line(
  lineId: number,
  sku: string | null,
  itemCount: number,
): ReceivingLinePhotoCount {
  return { lineId, sku, itemCount };
}

function evaluate(
  policy: ReceivingPhotoPolicy,
  overrides: Partial<Omit<EvaluateReceivingPhotoPolicyInput, 'policy'>> = {},
): ReceivingPhotoPolicyResult {
  const result = evaluateReceivingPhotoPolicy({
    policy,
    cartonPhotoCounts: { package: 0, unboxCarton: 0 },
    linePhotoCounts: [],
    ...overrides,
  });
  // Structural invariant on every path: ok exactly when there are no blockers.
  assert.equal(result.ok, result.blockers.length === 0);
  return result;
}

describe('evaluateReceivingPhotoPolicy · optional', () => {
  it('is ok with zero evidence anywhere', () => {
    assert.deepEqual(evaluate('optional'), { ok: true, blockers: [] });
  });

  it('is ok regardless of counts, including lines with no item photos', () => {
    const result = evaluate('optional', {
      cartonPhotoCounts: { package: 4, unboxCarton: 2 },
      linePhotoCounts: [line(1, 'SKU-A', 0), line(2, null, 3)],
    });
    assert.deepEqual(result, { ok: true, blockers: [] });
  });
});

describe('evaluateReceivingPhotoPolicy · require_one', () => {
  it('passes with exactly one arrival package photo', () => {
    const result = evaluate('require_one', {
      cartonPhotoCounts: { package: 1, unboxCarton: 0 },
    });
    assert.deepEqual(result, { ok: true, blockers: [] });
  });

  it('passes with several package photos and ignores other stages', () => {
    const result = evaluate('require_one', {
      cartonPhotoCounts: { package: 3, unboxCarton: 5 },
      linePhotoCounts: [line(1, 'SKU-A', 2)],
    });
    assert.deepEqual(result, { ok: true, blockers: [] });
  });

  it('blocks with zero photos anywhere, base copy', () => {
    const result = evaluate('require_one');
    assert.deepEqual(result, {
      ok: false,
      blockers: ['Carton needs an arrival package photo'],
    });
  });

  it('unbox-carton photos alone do NOT satisfy it — copy names the mismatch', () => {
    const result = evaluate('require_one', {
      cartonPhotoCounts: { package: 0, unboxCarton: 2 },
    });
    assert.deepEqual(result, {
      ok: false,
      blockers: ['Carton needs an arrival package photo (unbox and item photos do not count)'],
    });
  });

  it('item photos alone do NOT satisfy it — even when every line is covered', () => {
    const result = evaluate('require_one', {
      linePhotoCounts: [line(1, 'SKU-A', 2), line(2, 'SKU-B', 1)],
    });
    assert.deepEqual(result, {
      ok: false,
      blockers: ['Carton needs an arrival package photo (unbox and item photos do not count)'],
    });
  });

  it('treats non-finite / negative package counts as no evidence', () => {
    assert.equal(evaluate('require_one', { cartonPhotoCounts: { package: Number.NaN, unboxCarton: 0 } }).ok, false);
    assert.equal(evaluate('require_one', { cartonPhotoCounts: { package: -1, unboxCarton: 0 } }).ok, false);
    assert.equal(
      evaluate('require_one', { cartonPhotoCounts: { package: Number.POSITIVE_INFINITY, unboxCarton: 0 } }).ok,
      false,
    );
  });

  it('non-finite secondary counts do not fake the "other evidence" hint', () => {
    const result = evaluate('require_one', {
      cartonPhotoCounts: { package: 0, unboxCarton: Number.NaN },
      linePhotoCounts: [line(1, 'SKU-A', Number.NaN)],
    });
    assert.deepEqual(result.blockers, ['Carton needs an arrival package photo']);
  });
});

describe('evaluateReceivingPhotoPolicy · require_per_item', () => {
  it('passes when every line has at least one item photo — package not required', () => {
    const result = evaluate('require_per_item', {
      cartonPhotoCounts: { package: 0, unboxCarton: 0 },
      linePhotoCounts: [line(1, 'SKU-A', 1), line(2, 'SKU-B', 4)],
    });
    assert.deepEqual(result, { ok: true, blockers: [] });
  });

  it('is vacuously ok with zero (non-cancelled) lines', () => {
    assert.deepEqual(evaluate('require_per_item', { linePhotoCounts: [] }), {
      ok: true,
      blockers: [],
    });
  });

  it('one missing line → singular copy with its SKU', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [line(1, 'SKU-A', 0), line(2, 'SKU-B', 2)],
    });
    assert.deepEqual(result.blockers, ['1 line needs an item photo: SKU-A']);
  });

  it('null / blank SKUs fall back to the line id', () => {
    const nullSku = evaluate('require_per_item', { linePhotoCounts: [line(12, null, 0)] });
    assert.deepEqual(nullSku.blockers, ['1 line needs an item photo: line #12']);

    const blankSku = evaluate('require_per_item', { linePhotoCounts: [line(7, '   ', 0)] });
    assert.deepEqual(blankSku.blockers, ['1 line needs an item photo: line #7']);
  });

  it('two missing lines → both named, no truncation', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [line(1, 'SKU-A', 0), line(2, 'SKU-B', 0), line(3, 'SKU-C', 1)],
    });
    assert.deepEqual(result.blockers, ['2 lines need item photos: SKU-A, SKU-B']);
  });

  it('three missing lines → the plan’s exact example copy', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [line(1, 'SKU-A', 0), line(2, 'SKU-B', 0), line(3, 'SKU-C', 0)],
    });
    assert.deepEqual(result.blockers, ['3 lines need item photos: SKU-A, SKU-B, +1 more']);
  });

  it('five missing lines → +3 more', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [
        line(1, 'SKU-A', 0),
        line(2, 'SKU-B', 0),
        line(3, 'SKU-C', 0),
        line(4, 'SKU-D', 0),
        line(5, 'SKU-E', 0),
      ],
    });
    assert.deepEqual(result.blockers, ['5 lines need item photos: SKU-A, SKU-B, +3 more']);
  });

  it('duplicate SKUs de-duplicate in the name list while the line count stays exact', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [line(1, 'SKU-A', 0), line(2, 'SKU-A', 0)],
    });
    assert.deepEqual(result.blockers, ['2 lines need item photos: SKU-A']);
  });

  it('de-dupe happens before truncation — hidden count is distinct names', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [
        line(1, 'SKU-1', 0),
        line(2, 'SKU-1', 0),
        line(3, 'SKU-2', 0),
        line(4, 'SKU-3', 0),
      ],
    });
    assert.deepEqual(result.blockers, ['4 lines need item photos: SKU-1, SKU-2, +1 more']);
  });

  it('two null-sku lines stay distinct display names', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [line(7, null, 0), line(9, null, 0)],
    });
    assert.deepEqual(result.blockers, ['2 lines need item photos: line #7, line #9']);
  });

  it('treats non-finite / negative item counts as missing evidence', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [line(1, 'SKU-A', Number.NaN), line(2, 'SKU-B', -2), line(3, 'SKU-C', 1)],
    });
    assert.deepEqual(result.blockers, ['2 lines need item photos: SKU-A, SKU-B']);
  });

  it('names only the missing lines, in input order', () => {
    const result = evaluate('require_per_item', {
      linePhotoCounts: [line(3, 'SKU-C', 2), line(1, 'SKU-A', 0), line(2, 'SKU-B', 0)],
    });
    assert.deepEqual(result.blockers, ['2 lines need item photos: SKU-A, SKU-B']);
  });
});

describe('evaluateReceivingPhotoPolicy · corrupt policy value', () => {
  it('degrades an unknown stored value to optional (never blocks the bench)', () => {
    // The settings accessor casts stored JSON unvalidated — simulate corruption.
    const result = evaluate('definitely_not_a_policy' as ReceivingPhotoPolicy, {
      linePhotoCounts: [line(1, 'SKU-A', 0)],
    });
    assert.deepEqual(result, { ok: true, blockers: [] });
  });
});

describe('deriveReceivingPhotoStageCounts', () => {
  it('buckets carton rows by stage and line rows by line id', () => {
    const counts = deriveReceivingPhotoStageCounts([
      { receivingLineId: null, caption: 'receiving_package' },
      { receivingLineId: null, caption: 'receiving' }, // legacy alias → package
      { receivingLineId: null, caption: '' }, // untyped legacy carton row → package
      { receivingLineId: null, caption: 'receiving_unbox_carton' },
      { receivingLineId: 7, caption: 'receiving_item' },
      { receivingLineId: 7, caption: 'receiving_item' },
      // Entity wins: a line-linked row is item evidence regardless of stamp.
      { receivingLineId: 9, caption: 'receiving_package' },
    ]);
    assert.deepEqual(counts.cartonPhotoCounts, { package: 3, unboxCarton: 1 });
    assert.equal(counts.itemCountsByLineId.get(7), 2);
    assert.equal(counts.itemCountsByLineId.get(9), 1);
  });

  it('never counts a mis-stamped item-on-carton row as any carton stage', () => {
    const counts = deriveReceivingPhotoStageCounts([
      { receivingLineId: null, caption: 'receiving_item' },
    ]);
    assert.deepEqual(counts.cartonPhotoCounts, { package: 0, unboxCarton: 0 });
    assert.equal(counts.itemCountsByLineId.size, 0);
  });

  it('returns zero counts for null/undefined/empty input', () => {
    for (const input of [null, undefined, []]) {
      const counts = deriveReceivingPhotoStageCounts(input);
      assert.deepEqual(counts.cartonPhotoCounts, { package: 0, unboxCarton: 0 });
      assert.equal(counts.itemCountsByLineId.size, 0);
    }
  });

  it('feeds the evaluator directly (require_per_item over derived counts)', () => {
    const { cartonPhotoCounts, itemCountsByLineId } = deriveReceivingPhotoStageCounts([
      { receivingLineId: 5, caption: 'receiving_item' },
    ]);
    const result = evaluateReceivingPhotoPolicy({
      policy: 'require_per_item',
      cartonPhotoCounts,
      linePhotoCounts: [
        { lineId: 5, sku: 'SKU-A', itemCount: itemCountsByLineId.get(5) ?? 0 },
        { lineId: 6, sku: 'SKU-B', itemCount: itemCountsByLineId.get(6) ?? 0 },
      ],
    });
    assert.equal(result.ok, false);
    assert.match(result.blockers[0], /1 line needs an item photo: SKU-B/);
  });
});

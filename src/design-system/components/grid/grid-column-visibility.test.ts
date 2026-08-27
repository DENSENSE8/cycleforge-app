import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isGridColumnVisible, resolveGridColumns } from './useGridColumnVisibility';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

const col = (
  key: string,
  extra: Partial<LedgerGridColumnModel> = {},
): LedgerGridColumnModel => ({ key, width: 'minmax(3rem, 3rem)', ...extra });

/** A miniature descriptor with one of each shape. */
const COLUMNS: LedgerGridColumnModel[] = [
  col('select'), // structural — no hideKey
  col('title'), // structural — no hideKey
  col('qty', { hideKey: 'qty', label: 'Qty' }),
  col('condition', { hideKey: 'condition', label: 'Cond' }),
  col('tracking', { hideKey: 'tracking', label: 'Tracking', tier: 'optional' }),
  col('serial', { hideKey: 'serial', label: 'Serial', tier: 'optional' }),
];

const keys = (cols: LedgerGridColumnModel[]) => cols.map((c) => c.key);

describe('grid column visibility — the single resolution rule', () => {
  it('ships the lean default: core on, optional off', () => {
    assert.deepEqual(keys(resolveGridColumns(COLUMNS)), [
      'select',
      'title',
      'qty',
      'condition',
    ]);
  });

  it('never offers a structural column (no hideKey) to be hidden', () => {
    // Even a hostile/stale delta naming them cannot drop select · title.
    const delta = { hidden: ['select', 'title'] };
    assert.equal(isGridColumnVisible(col('select'), delta), true);
    assert.equal(isGridColumnVisible(col('title'), delta), true);
  });

  it('opts a staffer INTO an optional column via `shown`', () => {
    const visible = resolveGridColumns(COLUMNS, { shown: ['serial'] });
    assert.deepEqual(keys(visible), ['select', 'title', 'qty', 'condition', 'serial']);
  });

  it('opts a staffer OUT of a core column via `hidden`', () => {
    const visible = resolveGridColumns(COLUMNS, { hidden: ['qty'] });
    assert.deepEqual(keys(visible), ['select', 'title', 'condition']);
  });

  it('keeps the delta additive — shipping a new optional column widens nobody', () => {
    const staffDelta = { hidden: ['condition'], shown: ['tracking'] };
    const before = keys(resolveGridColumns(COLUMNS, staffDelta));
    // Descriptor grows a brand-new opt-in column later.
    const grown = [...COLUMNS, col('age', { hideKey: 'age', label: 'Age', tier: 'optional' })];
    const after = keys(resolveGridColumns(grown, staffDelta));
    assert.deepEqual(after, before, 'a new optional column must not appear unasked');
  });

  it('lets the lean default widen later without re-showing a curated-away track', () => {
    const staffDelta = { hidden: ['qty'] };
    // `tracking` is promoted from optional → core in a later release.
    const promoted = COLUMNS.map((c) =>
      c.key === 'tracking' ? { ...c, tier: 'core' as const } : c,
    );
    const visible = keys(resolveGridColumns(promoted, staffDelta));
    assert.ok(visible.includes('tracking'), 'promotion reaches staff who never opted out');
    assert.ok(!visible.includes('qty'), 'their explicit opt-out survives the promotion');
  });

  it('lets viewport force-hide beat staff intent (the track cannot fit)', () => {
    const visible = resolveGridColumns(
      COLUMNS,
      { shown: ['serial'] },
      new Set(['serial', 'qty']),
    );
    assert.deepEqual(keys(visible), ['select', 'title', 'condition']);
  });

  it('force-hides by column KEY, not by pref key', () => {
    // Two tracks answering one `rest` pref key must collapse independently.
    const cols = [
      col('stage', { hideKey: 'rest', label: 'Stage' }),
      col('age', { hideKey: 'rest', label: 'Age' }),
    ];
    assert.deepEqual(keys(resolveGridColumns(cols, {}, new Set(['age']))), ['stage']);
    // …but the shared pref key drops both at once.
    assert.deepEqual(keys(resolveGridColumns(cols, { hidden: ['rest'] })), []);
  });

  it('is order-preserving — resolution never reshuffles canonical scan order', () => {
    const visible = resolveGridColumns(COLUMNS, { shown: ['serial', 'tracking'] });
    assert.deepEqual(keys(visible), [
      'select',
      'title',
      'qty',
      'condition',
      'tracking',
      'serial',
    ]);
  });

  it('ignores unknown / stale keys in a persisted delta', () => {
    const visible = resolveGridColumns(COLUMNS, {
      hidden: ['a-column-that-no-longer-exists'],
      shown: ['also-gone'],
    });
    assert.deepEqual(keys(visible), ['select', 'title', 'qty', 'condition']);
  });
});

describe('grid column tier contract', () => {
  it('an optional column without a hideKey would be permanently invisible', () => {
    // Guard the authoring mistake at the type-of-data level: `optional` means
    // "off until a staffer opts in", and the ONLY opt-in channel is `hideKey`.
    const broken = col('ghost', { tier: 'optional' });
    assert.equal(
      isGridColumnVisible(broken, { shown: ['ghost'] }),
      true,
      'no hideKey short-circuits to structural — which is why authoring this is a bug',
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compoundSelectStatusMarks } from './compound-select-status';

const URGENT = {
  label: 'Urgent',
  kind: 'urgent',
  barClass: 'bg-yellow-400',
  pulse: true,
  tickClass: 'bg-yellow-100',
} as const;

const SHORT_RAIL = {
  label: 'Out of stock',
  kind: 'attention',
  barClass: 'bg-rose-500',
  pulse: true,
  tickClass: 'bg-rose-100',
} as const;

const OOS = { label: 'Out of stock', tip: '2 short' } as const;

const IMPORTED = {
  label: 'New · 18s',
  barClass: 'bg-[var(--ds-color-surface-accent)]',
  tickClass: 'bg-[var(--ds-color-text-accent)]',
} as const;

describe('compoundSelectStatusMarks — what the gutter says at rest', () => {
  it('is nothing on an ordinary row', () => {
    assert.deepEqual(compoundSelectStatusMarks({}), []);
    assert.deepEqual(compoundSelectStatusMarks({ edgeMark: null, itemStatus: null }), []);
  });

  it('reports the order-level expedite as a flashing urgent mark', () => {
    assert.deepEqual(compoundSelectStatusMarks({ edgeMark: URGENT }), [
      { kind: 'urgent', label: 'Urgent', flash: true },
    ]);
  });

  it('reports a shortage rail as a flashing attention mark, not an urgent one', () => {
    assert.deepEqual(compoundSelectStatusMarks({ edgeMark: SHORT_RAIL }), [
      { kind: 'attention', label: 'Out of stock', flash: true },
    ]);
  });

  it('carries the rail pulse flag rather than assuming it', () => {
    const marks = compoundSelectStatusMarks({
      edgeMark: { label: 'Blocked', kind: 'attention', barClass: 'bg-rose-500' },
    });
    assert.equal(marks[0]?.flash, false);
  });

  it('flashes a product flag on a family whose rail is unwired', () => {
    assert.deepEqual(compoundSelectStatusMarks({ itemStatus: OOS }), [
      { kind: 'attention', label: 'Out of stock', flash: true },
    ]);
  });

  it('keeps a new-import marker behind urgent and attention facts', () => {
    assert.deepEqual(
      compoundSelectStatusMarks({ edgeMark: URGENT, itemStatus: OOS, importMark: IMPORTED }),
      [
        { kind: 'urgent', label: 'Urgent', flash: true },
        { kind: 'attention', label: 'Out of stock', flash: true },
        { kind: 'imported', label: 'New · 18s', flash: false },
      ],
    );
  });

  it('carries BOTH marks, urgent first, when a rush order is also short', () => {
    // The rotation case: one box, two facts, expedite named first because it
    // is the hotter one.
    assert.deepEqual(compoundSelectStatusMarks({ edgeMark: URGENT, itemStatus: OOS }), [
      { kind: 'urgent', label: 'Urgent', flash: true },
      { kind: 'attention', label: 'Out of stock', flash: true },
    ]);
  });

  it('never says the same kind twice — an attention rail IS the product flag', () => {
    const marks = compoundSelectStatusMarks({ edgeMark: SHORT_RAIL, itemStatus: OOS });
    assert.equal(marks.length, 1);
    assert.equal(marks[0]?.kind, 'attention');
  });
});

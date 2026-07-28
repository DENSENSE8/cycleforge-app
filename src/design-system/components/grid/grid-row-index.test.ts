import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RowGroup } from '@/lib/group-rows';
import {
  GRID_HEADER_ROW_INDEX,
  countGridRows,
  groupRowSpan,
} from './grid-row-index';

type Row = { id: string };

const group = (key: string, n: number): RowGroup<Row> =>
  ({ key, rows: Array.from({ length: n }, (_, i) => ({ id: `${key}-${i}` })) }) as RowGroup<Row>;

describe('grid row span', () => {
  it('a singleton group is ONE row, not a summary plus a child', () => {
    // QueueGroupRow short-circuits `rows.length === 1` to renderRow directly —
    // counting a phantom summary here would shift every later index by one.
    assert.equal(groupRowSpan(group('a', 1)), 1);
  });

  it('a multi-row group is its summary plus every child', () => {
    assert.equal(groupRowSpan(group('a', 2)), 3);
    assert.equal(groupRowSpan(group('a', 5)), 6);
  });
});

describe('countGridRows', () => {
  it('reserves row 1 for the column header', () => {
    assert.equal(countGridRows<Row>({ daySections: [] }), GRID_HEADER_ROW_INDEX);
    assert.equal(GRID_HEADER_ROW_INDEX, 1);
  });

  it('counts flat day sections without day bands', () => {
    const total = countGridRows<Row>({
      daySections: [
        ['2026-07-01', [{ id: 'a' }, { id: 'b' }]],
        ['2026-07-02', [{ id: 'c' }]],
      ],
    });
    assert.equal(total, 1 + 3);
  });

  it('day bands each take a row of their own', () => {
    const total = countGridRows<Row>({
      daySections: [
        ['2026-07-01', [{ id: 'a' }, { id: 'b' }]],
        ['2026-07-02', [{ id: 'c' }]],
      ],
      showDayHeaders: true,
    });
    assert.equal(total, 1 + 2 + 3);
  });

  it('counts folded groups as if fully expanded', () => {
    // Collapsed folds must NOT shrink the count — indices stay stable and
    // aria-rowcount stays the total, which is what keeps a user's place.
    const total = countGridRows<Row>({
      orderGroupsByDate: [['2026-07-01', [group('a', 1), group('b', 3)]]],
    });
    assert.equal(total, 1 + 1 + 4);
  });

  it('mixes day bands and folds', () => {
    const total = countGridRows<Row>({
      orderGroupsByDate: [
        ['2026-07-01', [group('a', 1), group('b', 2)]],
        ['2026-07-02', [group('c', 1)]],
      ],
      showDayHeaders: true,
    });
    // header + (band + 1 + 3) + (band + 1)
    assert.equal(total, 1 + (1 + 1 + 3) + (1 + 1));
  });

  it('groups win when both shapes are passed (LedgerGrid treats them exclusive)', () => {
    const total = countGridRows<Row>({
      orderGroupsByDate: [['2026-07-01', [group('a', 1)]]],
      daySections: [['2026-07-01', [{ id: 'x' }, { id: 'y' }, { id: 'z' }]]],
    });
    assert.equal(total, 1 + 1);
  });

  it('an empty grid is just the header row', () => {
    assert.equal(countGridRows<Row>({ orderGroupsByDate: [] }), 1);
    assert.equal(countGridRows<Row>({}), 1);
  });
});
